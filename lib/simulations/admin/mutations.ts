import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/session";
import {
  type ContentRow,
  type CreateScenarioData,
  formValuesFromRow,
  inFamily,
  type IssueKey,
  laterDraft,
  nextVersion,
  publishIssues,
  type ScenarioContent,
  scenarioContentSchema,
  stagesCreateData,
  versionInfo,
  versionsToUnpublish,
} from "./content";
import { eligibleProtocolsWhere } from "./queries";

/**
 * Writes of the platform-admin scenario editor. The callers (./actions.ts) authorise the platform admin and validate
 * the input first; these functions re-check everything that depends on the database, inside one transaction, and
 * write the audit row in that transaction (writeAudit with { tx }: no change without its audit row).
 *
 * Integrity rules (CONVENTIONS 6):
 * - A scenario with attempts (any status) is never edited in place: the save locks the scenario row
 *   (SELECT … FOR UPDATE), so an attempt that starts at the same moment waits for the save (its foreign key needs a
 *   KEY SHARE lock on the row) and the attempt count read after the lock is final.
 * - Optimistic concurrency: the save carries the updatedAt the editor loaded; a different value means someone else
 *   changed the scenario, and nothing is overwritten.
 * - Versions of one scenario (./content.ts versionInfo) are published one at a time: publishing a version unpublishes
 *   the others. Publish and "new version" serialise on a per-family advisory lock, taken BEFORE any row lock so two
 *   admins publishing two versions at once cannot deadlock. Attempts still in progress on a replaced version are
 *   closed as unfinished ("abandoned") in the same transaction: the old version is gone for trainees (an old link
 *   opens the new one), so they could never finish them, and reports must not count them as in progress forever.
 *   The publish dialog says how many (FamilyMember.inProgress). Unpublishing alone keeps open attempts as they are:
 *   they cannot take answers while it is unpublished (lib/simulations/attempts.ts) and continue if it comes back.
 * - Deleting is for drafts only (unpublished, no attempts): published scenarios and history are unpublished instead.
 */

export type AdminError =
  | "not_found"
  | "stale"
  | "has_attempts"
  | "slug_taken"
  | "protocol_not_allowed"
  | "organization_not_found"
  | "invalid_content"
  | "cannot_publish"
  | "not_draft";

export type Failure = { ok: false; error: AdminError; issues?: IssueKey[] };

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

const TARGET = (id: string) => ({ type: "scenario", id });

type Tx = Prisma.TransactionClient;

/** Locks the scenario row for the rest of the transaction; null when it does not exist. */
async function lockScenario(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; slug: string; organizationId: string | null; updatedAt: Date; isPublished: boolean }>>`
    SELECT "id", "slug", "organizationId", "updatedAt", "isPublished" FROM "scenario" WHERE "id" = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

/** Serialises publish / new version within one version family (same owner, same base slug). */
async function lockFamily(tx: Tx, organizationId: string | null, base: string) {
  const key = `scenario-family:${organizationId ?? "global"}:${base}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

async function familyRows(tx: Tx, organizationId: string | null, base: string) {
  const rows = await tx.scenario.findMany({
    where: { organizationId, OR: [{ slug: base }, { slug: { startsWith: `${base}-v` } }] },
    select: { id: true, slug: true, isPublished: true, _count: { select: { attempts: true } } },
  });
  return rows
    .filter((r) => inFamily(base, r.slug))
    .map((r) => ({ id: r.id, slug: r.slug, isPublished: r.isPublished, attempts: r._count.attempts }));
}

/** The step ids of a protocol the owner may use, or null when it may not use it (or it does not exist). */
export async function eligibleProtocolSteps(protocolId: string, organizationId: string | null): Promise<Set<string> | null> {
  const protocol = await prisma.protocol.findFirst({
    where: { AND: [{ id: protocolId }, eligibleProtocolsWhere(organizationId)] },
    select: { steps: { select: { id: true } } },
  });
  return protocol ? new Set(protocol.steps.map((s) => s.id)) : null;
}

/** The owner of a scenario (for the save's validation), or undefined when it does not exist. */
export async function scenarioOwner(id: string): Promise<{ organizationId: string | null } | undefined> {
  const row = await prisma.scenario.findUnique({ where: { id }, select: { organizationId: true } });
  return row ?? undefined;
}

// ---------------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------------

export async function createScenario(ctx: AuthContext, data: CreateScenarioData): Promise<{ ok: true; id: string } | Failure> {
  if (data.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true } });
    if (!org) return { ok: false, error: "organization_not_found" };
  }
  if (!(await eligibleProtocolSteps(data.protocolId, data.organizationId))) return { ok: false, error: "protocol_not_allowed" };
  try {
    const id = await prisma.$transaction(async (tx) => {
      const row = await tx.scenario.create({
        data: {
          slug: data.slug,
          protocolId: data.protocolId,
          organizationId: data.organizationId,
          titleAr: data.titleAr,
          titleEn: data.titleEn,
          introAr: data.introAr,
          introEn: data.introEn,
          settingAr: data.settingAr,
          settingEn: data.settingEn,
          difficulty: data.difficulty,
          estimatedMinutes: data.estimatedMinutes,
          isPublished: false,
        },
        select: { id: true },
      });
      await writeAudit(
        ctx,
        "scenario.create",
        TARGET(row.id),
        { slug: data.slug, organizationId: data.organizationId, protocolId: data.protocolId },
        { tx },
      );
      return row.id;
    });
    return { ok: true, id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "slug_taken" };
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------
// Save (edit in place: only while nobody has attempted it)
// ---------------------------------------------------------------------------------------------------

export async function saveScenario(
  ctx: AuthContext,
  input: { id: string; expectedUpdatedAt: string; content: ScenarioContent },
): Promise<{ ok: true; updatedAt: string } | Failure> {
  const { id, content } = input;
  return prisma.$transaction(async (tx) => {
    const locked = await lockScenario(tx, id);
    if (!locked) return { ok: false as const, error: "not_found" as const };
    if (locked.updatedAt.toISOString() !== input.expectedUpdatedAt) return { ok: false as const, error: "stale" as const };
    if ((await tx.simulationAttempt.count({ where: { scenarioId: id } })) > 0) return { ok: false as const, error: "has_attempts" as const };

    const protocol = await tx.protocol.findFirst({
      where: { AND: [{ id: content.protocolId }, eligibleProtocolsWhere(locked.organizationId)] },
      select: { steps: { select: { id: true } } },
    });
    if (!protocol) return { ok: false as const, error: "protocol_not_allowed" as const };
    const steps = new Set(protocol.steps.map((s) => s.id));
    // Re-checked here (the action validated with the same rules): the protocol's steps are read in this transaction.
    if (!scenarioContentSchema((pid) => (pid === content.protocolId ? steps : undefined)).safeParse(content).success) {
      return { ok: false as const, error: "invalid_content" as const };
    }
    // A published scenario stays playable: it must keep meeting the publish rules.
    const issues = locked.isPublished ? publishIssues(content) : [];
    if (issues.length > 0) return { ok: false as const, error: "cannot_publish" as const, issues };

    await tx.scenarioStage.deleteMany({ where: { scenarioId: id } });
    const updated = await tx.scenario.update({
      where: { id },
      data: {
        titleAr: content.titleAr,
        titleEn: content.titleEn,
        introAr: content.introAr,
        introEn: content.introEn,
        settingAr: content.settingAr,
        settingEn: content.settingEn,
        protocolId: content.protocolId,
        difficulty: content.difficulty,
        estimatedMinutes: content.estimatedMinutes,
        stages: { create: stagesCreateData(content.stages) },
      },
      select: { updatedAt: true },
    });
    await writeAudit(
      ctx,
      "scenario.update",
      TARGET(id),
      {
        slug: locked.slug,
        stages: content.stages.length,
        options: content.stages.reduce((n, s) => n + s.options.length, 0),
        published: locked.isPublished,
      },
      { tx },
    );
    return { ok: true as const, updatedAt: updated.updatedAt.toISOString() };
  });
}

// ---------------------------------------------------------------------------------------------------
// Publish / unpublish
// ---------------------------------------------------------------------------------------------------

const publishSelect = {
  isPublished: true,
  protocol: { select: { organizationId: true, steps: { select: { id: true } } } },
  titleAr: true,
  titleEn: true,
  introAr: true,
  introEn: true,
  settingAr: true,
  settingEn: true,
  protocolId: true,
  difficulty: true,
  estimatedMinutes: true,
  stages: {
    orderBy: { order: "asc" },
    select: {
      kind: true,
      contextAr: true,
      contextEn: true,
      promptAr: true,
      promptEn: true,
      options: {
        orderBy: { order: "asc" },
        select: { textAr: true, textEn: true, isCorrect: true, isCritical: true, stepId: true, feedbackAr: true, feedbackEn: true },
      },
    },
  },
} as const satisfies Prisma.ScenarioSelect;

/**
 * Publishes a scenario after checking its stored content, and unpublishes the other versions of it (the rule "publish
 * the new version, the old one is unpublished"), closing their open attempts as unfinished. Idempotent for a scenario
 * that is already the published version.
 */
export async function publishScenario(ctx: AuthContext, id: string): Promise<{ ok: true; replaced: string[]; abandoned: number } | Failure> {
  const head = await prisma.scenario.findUnique({ where: { id }, select: { slug: true, organizationId: true } });
  if (!head) return { ok: false, error: "not_found" };
  const { base } = versionInfo(head.slug); // slug and owner never change after creation
  return prisma.$transaction(async (tx) => {
    await lockFamily(tx, head.organizationId, base);
    const locked = await lockScenario(tx, id);
    if (!locked) return { ok: false as const, error: "not_found" as const };
    const row = await tx.scenario.findUnique({ where: { id }, select: publishSelect });
    if (!row) return { ok: false as const, error: "not_found" as const };
    if (row.protocol.organizationId !== null && row.protocol.organizationId !== locked.organizationId) {
      return { ok: false as const, error: "protocol_not_allowed" as const };
    }
    const steps = new Set(row.protocol.steps.map((s) => s.id));
    const values = formValuesFromRow(row as ContentRow);
    if (!scenarioContentSchema((pid) => (pid === row.protocolId ? steps : undefined)).safeParse(values).success) {
      return { ok: false as const, error: "invalid_content" as const };
    }
    const issues = publishIssues(values);
    if (issues.length > 0) return { ok: false as const, error: "cannot_publish" as const, issues };

    const replaced = versionsToUnpublish(id, base, await familyRows(tx, locked.organizationId, base));
    let abandoned = 0;
    if (replaced.length > 0) {
      await tx.scenario.updateMany({ where: { id: { in: replaced } }, data: { isPublished: false } });
      abandoned = (
        await tx.simulationAttempt.updateMany({ where: { scenarioId: { in: replaced }, status: "in_progress" }, data: { status: "abandoned" } })
      ).count;
    }
    if (!row.isPublished) await tx.scenario.update({ where: { id }, data: { isPublished: true } });
    if (!row.isPublished || replaced.length > 0) {
      await writeAudit(ctx, "scenario.publish", TARGET(id), { slug: locked.slug, replaced, abandoned }, { tx });
      for (const old of replaced) await writeAudit(ctx, "scenario.unpublish", TARGET(old), { replacedBy: id }, { tx });
    }
    return { ok: true as const, replaced, abandoned };
  });
}

export async function unpublishScenario(ctx: AuthContext, id: string): Promise<{ ok: true } | Failure> {
  return prisma.$transaction(async (tx) => {
    const locked = await lockScenario(tx, id);
    if (!locked) return { ok: false as const, error: "not_found" as const };
    if (!locked.isPublished) return { ok: true as const };
    await tx.scenario.update({ where: { id }, data: { isPublished: false } });
    const inProgress = await tx.simulationAttempt.count({ where: { scenarioId: id, status: "in_progress" } });
    await writeAudit(ctx, "scenario.unpublish", TARGET(id), { slug: locked.slug, inProgress }, { tx });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------------------------------
// New version
// ---------------------------------------------------------------------------------------------------

/**
 * Copies a scenario (content, protocol, owner) into the next version, unpublished, for editing. When a draft of a
 * later version already exists, that draft is returned instead (`existing: true`) so copies do not pile up.
 */
export async function createVersion(
  ctx: AuthContext,
  id: string,
): Promise<{ ok: true; id: string; version: number; existing: boolean } | Failure> {
  const head = await prisma.scenario.findUnique({ where: { id }, select: { slug: true, organizationId: true } });
  if (!head) return { ok: false, error: "not_found" };
  const { base } = versionInfo(head.slug);
  return prisma.$transaction(async (tx) => {
    await lockFamily(tx, head.organizationId, base);
    // Blocks an in-place save of the source while it is copied (the copy is one consistent snapshot).
    const locked = await lockScenario(tx, id);
    if (!locked) return { ok: false as const, error: "not_found" as const };
    const family = await familyRows(tx, locked.organizationId, base);
    const draft = laterDraft(locked, family);
    if (draft) return { ok: true as const, id: draft.id, version: versionInfo(draft.slug).version, existing: true };

    const source = await tx.scenario.findUnique({ where: { id }, select: publishSelect });
    if (!source) return { ok: false as const, error: "not_found" as const };
    const next = nextVersion(
      base,
      family.map((f) => f.slug),
    );
    const values = formValuesFromRow(source as ContentRow);
    const copy = await tx.scenario.create({
      data: {
        slug: next.slug,
        protocolId: source.protocolId,
        organizationId: locked.organizationId,
        titleAr: source.titleAr,
        titleEn: source.titleEn,
        introAr: source.introAr,
        introEn: source.introEn,
        settingAr: source.settingAr,
        settingEn: source.settingEn,
        difficulty: source.difficulty,
        estimatedMinutes: source.estimatedMinutes,
        isPublished: false,
        stages: { create: stagesCreateData(values.stages as ScenarioContent["stages"]) },
      },
      select: { id: true },
    });
    await writeAudit(
      ctx,
      "scenario.version",
      TARGET(copy.id),
      { fromId: id, fromSlug: locked.slug, slug: next.slug, version: next.version },
      { tx },
    );
    return { ok: true as const, id: copy.id, version: next.version, existing: false };
  });
}

// ---------------------------------------------------------------------------------------------------
// Delete (drafts only)
// ---------------------------------------------------------------------------------------------------

export async function deleteDraft(ctx: AuthContext, id: string): Promise<{ ok: true } | Failure> {
  return prisma.$transaction(async (tx) => {
    const locked = await lockScenario(tx, id);
    if (!locked) return { ok: false as const, error: "not_found" as const };
    if (locked.isPublished || (await tx.simulationAttempt.count({ where: { scenarioId: id } })) > 0) {
      return { ok: false as const, error: "not_draft" as const };
    }
    await tx.scenario.delete({ where: { id } });
    await writeAudit(ctx, "scenario.delete", TARGET(id), { slug: locked.slug, organizationId: locked.organizationId }, { tx });
    return { ok: true as const };
  });
}
