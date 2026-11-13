import "server-only";
import type { Difficulty } from "@/generated/prisma/enums";
import { type Scope, scenariosReadable } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { prioritizeViolations, type StepMeta } from "@/lib/scoring";

/**
 * Rule-based recommendations (PRODUCT 4), shared by simulations, scans, reports and the dashboard:
 * violated steps in priority order, each with its rationale (on the step row you pass) and the scenario that
 * trains its protocol. The list always exists even when the AI summary fails.
 *
 *   const recs = await recommendationsFor(scopeOf(ctx), violatedSteps, result.criticalViolations);
 *   recs.map((r) => ({ text: pick(r.step, "text", locale), why: pick(r.step, "rationale", locale), scenario: r.scenario }))
 */

export type RecommendedScenario = {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
};

/** A violated step: scoring metadata + its protocol (+ whatever columns the caller loaded, e.g. rationale). */
export type ViolatedStep = StepMeta & { protocolId: string };

export type Recommendation<T extends ViolatedStep> = {
  step: T;
  /** Violated critically (critical step, or a critical wrong option in a simulation). */
  critical: boolean;
  /** A published scenario the user may play that trains this step's protocol, or null when none exists. */
  scenario: RecommendedScenario | null;
};

/** Pure part (unit-tested): priority order + the scenario for each step's protocol. */
export function buildRecommendations<T extends ViolatedStep>(
  violated: readonly T[],
  criticalIds: readonly string[],
  scenarioByProtocol: ReadonlyMap<string, RecommendedScenario>,
): Recommendation<T>[] {
  const critical = new Set(criticalIds);
  return prioritizeViolations(violated, criticalIds).map((step) => ({
    step,
    critical: step.isCritical || critical.has(step.id),
    scenario: scenarioByProtocol.get(step.protocolId) ?? null,
  }));
}

/** Version links (Protocol.versionOfId) and copies (sourceProtocolId) around the protocols being recommended for. */
export type ProtocolLinks = {
  /** copy id -> the protocol it was copied from */
  sourceOf: ReadonlyMap<string, string>;
  /** version id -> the protocol it is a new version of */
  versionOf: ReadonlyMap<string, string>;
  /** protocol id -> its newer versions, oldest first */
  versionsOf: ReadonlyMap<string, readonly string[]>;
};

const MAX_LINK_HOPS = 10;

function olderVersions(id: string, links: ProtocolLinks): string[] {
  const out: string[] = [];
  let cur = links.versionOf.get(id);
  while (cur && cur !== id && !out.includes(cur) && out.length < MAX_LINK_HOPS) {
    out.push(cur);
    cur = links.versionOf.get(cur);
  }
  return out;
}

function newerVersions(id: string, links: ProtocolLinks): string[] {
  const out: string[] = [];
  const walk = (cur: string, depth: number) => {
    if (depth > MAX_LINK_HOPS) return;
    for (const next of [...(links.versionsOf.get(cur) ?? [])].reverse()) {
      if (next === id || out.includes(next)) continue;
      walk(next, depth + 1); // the newest descendants first
      if (!out.includes(next)) out.push(next);
    }
  };
  walk(id, 0);
  return out;
}

/**
 * Where a protocol's training scenario may come from, in order (pure, unit-tested): the protocol itself, then the
 * versions it replaced (scenarios stay with the version they were written for); for an institution's copy, then its
 * source, the source's newer versions (newest first: the source may have moved on) and the source's older versions.
 */
export function scenarioFallbackChain(id: string, links: ProtocolLinks): string[] {
  const chain = [id, ...olderVersions(id, links)];
  const source = links.sourceOf.get(id);
  if (source) chain.push(source, ...newerVersions(source, links), ...olderVersions(source, links));
  return [...new Set(chain)];
}

/**
 * One recommended scenario per protocol, among those the user may play (scenariosReadable): the active
 * organization's own scenario first, then the global one; easiest first; oldest first. A protocol with no playable
 * scenario of its own gets one along scenarioFallbackChain: a new version gets the scenario of the version it
 * replaced, and an institution's custom protocol (a copy of a global one, Protocol.sourceProtocolId) the scenario of
 * its source or of the source's other versions.
 */
export async function recommendedScenarios(scope: Scope, protocolIds: readonly string[]): Promise<Map<string, RecommendedScenario>> {
  const ids = [...new Set(protocolIds)];
  const result = new Map<string, RecommendedScenario>();
  if (ids.length === 0) return result;
  const [protocols, versionRows] = await Promise.all([
    prisma.protocol.findMany({ where: { id: { in: ids } }, select: { id: true, sourceProtocolId: true } }),
    // New versions are rare: the whole list of links is short (indexed column).
    prisma.protocol.findMany({
      where: { versionOfId: { not: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, versionOfId: true },
    }),
  ]);
  const sourceOf = new Map<string, string>();
  for (const p of protocols) if (p.sourceProtocolId) sourceOf.set(p.id, p.sourceProtocolId);
  const versionOf = new Map<string, string>();
  const versionsOf = new Map<string, string[]>();
  for (const v of versionRows) {
    if (!v.versionOfId) continue;
    versionOf.set(v.id, v.versionOfId);
    versionsOf.set(v.versionOfId, [...(versionsOf.get(v.versionOfId) ?? []), v.id]);
  }
  const links: ProtocolLinks = { sourceOf, versionOf, versionsOf };
  const chains = new Map(ids.map((id) => [id, scenarioFallbackChain(id, links)]));

  const byProtocol = new Map<string, RecommendedScenario>();
  const rows = await prisma.scenario.findMany({
    where: { AND: [scenariosReadable(scope), { protocolId: { in: [...new Set([...chains.values()].flat())] } }] },
    orderBy: [{ difficulty: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      protocolId: true,
      organizationId: true,
      titleAr: true,
      titleEn: true,
      difficulty: true,
      estimatedMinutes: true,
    },
  });
  const own = (r: (typeof rows)[number]) => (scope.organizationId && r.organizationId === scope.organizationId ? 0 : 1);
  for (const row of [...rows].sort((a, b) => own(a) - own(b))) {
    if (byProtocol.has(row.protocolId)) continue;
    byProtocol.set(row.protocolId, {
      id: row.id,
      slug: row.slug,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      difficulty: row.difficulty,
      estimatedMinutes: row.estimatedMinutes,
    });
  }
  for (const [id, chain] of chains) {
    const scenario = chain.map((c) => byProtocol.get(c)).find((x) => x !== undefined);
    if (scenario) result.set(id, scenario);
  }
  return result;
}

/** Violated steps -> ordered recommendations with a scenario link each (two queries). */
export async function recommendationsFor<T extends ViolatedStep>(
  scope: Scope,
  violated: readonly T[],
  criticalIds: readonly string[] = [],
): Promise<Recommendation<T>[]> {
  if (violated.length === 0) return [];
  const scenarios = await recommendedScenarios(scope, violated.map((s) => s.protocolId));
  return buildRecommendations(violated, criticalIds, scenarios);
}
