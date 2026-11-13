/**
 * Test data for the reports e2e specs: simulation attempts and finalised scans written straight into the e2e
 * database (the scans and simulations features are built by other teams at the same time, so the specs cannot
 * produce results through their UI yet).
 *
 *   echo '<plan json>' | REPORTS_SEED_DATABASE_URL=postgresql://… pnpm exec tsx e2e/reports/support/seed-results.mts
 *
 * Reads a plan on stdin and prints one JSON line with the created ids. Scores and risk come from lib/scoring.ts, so
 * the rows look exactly like the ones the real features store. Never reads .env files: the database URL must be given.
 * Run by e2e/reports/support/data.ts (Playwright cannot load the generated Prisma client itself: it is ESM with
 * import.meta and cyclic imports, which Playwright's CommonJS transform rejects). Refuses a database whose name does
 * not contain "e2e" (REPORTS_SEED_ALLOW_ANY_DATABASE=1 for a local dev database), so it never writes to production.
 */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { scoreScan, scoreSimulation } from "../../../lib/scoring";
import type { SeedPlan, SeedResult } from "./types";

const url = process.env.REPORTS_SEED_DATABASE_URL;
if (!url) {
  console.error("seed-results: REPORTS_SEED_DATABASE_URL is required");
  process.exit(2);
}
if (!/e2e/i.test(new URL(url).pathname) && process.env.REPORTS_SEED_ALLOW_ANY_DATABASE !== "1") {
  console.error("seed-results: refusing a database whose name does not contain e2e");
  process.exit(2);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const plan = JSON.parse(await readStdin()) as SeedPlan;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);

try {
  const protocol = await prisma.protocol.findUniqueOrThrow({
    where: { slug: plan.protocolSlug },
    select: {
      id: true,
      steps: {
        orderBy: { order: "asc" },
        select: { id: true, key: true, textAr: true, textEn: true, weight: true, isMandatory: true, isCritical: true, visualCheck: true },
      },
    },
  });
  const steps = protocol.steps;
  const idOf = (key: string) => {
    const step = steps.find((s) => s.key === key);
    if (!step) throw new Error(`unknown step key ${key} in ${plan.protocolSlug}`);
    return step.id;
  };

  let scenarioId: string | null = null;
  let scenarioSlug: string | null = null;
  if (plan.scenario) {
    scenarioSlug = `e2e-${randomUUID().slice(0, 12)}`;
    const created = await prisma.scenario.create({
      data: {
        slug: scenarioSlug,
        protocolId: protocol.id,
        organizationId: plan.organizationId,
        titleAr: plan.scenario.titleAr,
        titleEn: plan.scenario.titleEn,
        introAr: "سيناريو اختبار",
        introEn: "Test scenario",
        settingAr: "غرفة مريض",
        settingEn: "Patient room",
        isPublished: true,
      },
    });
    scenarioId = created.id;
  }

  const teamIds: Record<string, string> = {};
  for (const team of plan.teams ?? []) {
    const id = randomUUID();
    await prisma.team.create({
      data: {
        id,
        name: team.name,
        organizationId: plan.organizationId,
        createdAt: new Date(),
        memberCount: team.userIds.length,
        teammembers: { create: team.userIds.map((userId) => ({ id: randomUUID(), userId, createdAt: new Date() })) },
      },
    });
    teamIds[team.key] = id;
  }

  const attemptIds: string[] = [];
  const attemptScores: Array<number | null> = [];
  const attemptRisks: SeedResult["attemptRisks"] = [];
  for (const a of plan.attempts ?? []) {
    if (!scenarioId) throw new Error("attempts need a scenario");
    const violated = new Set((a.violate ?? []).map(idOf));
    const critical = new Set((a.critical ?? []).map(idOf));
    const outcomes = steps.map((s) => ({ stepId: s.id, compliant: !violated.has(s.id) && !critical.has(s.id), critical: critical.has(s.id) }));
    const result = scoreSimulation(steps, outcomes);
    const done = (a.status ?? "completed") === "completed";
    const startedAt = at(a.daysAgo);
    const attempt = await prisma.simulationAttempt.create({
      data: {
        userId: a.userId,
        organizationId: a.inOrganization === false ? null : plan.organizationId,
        scenarioId,
        status: done ? "completed" : "in_progress",
        startedAt: new Date(startedAt.getTime() - 240_000),
        completedAt: done ? startedAt : null,
        durationSec: done ? 240 : null,
        score: done ? (result.assessable ? result.score : null) : null,
        riskLevel: done ? result.riskLevel : null,
        stepResults: done ? { create: outcomes } : undefined,
      },
    });
    attemptIds.push(attempt.id);
    attemptScores.push(attempt.score);
    attemptRisks.push(attempt.riskLevel);
  }

  const scanIds: string[] = [];
  const scanScores: Array<number | null> = [];
  const scanRisks: SeedResult["scanRisks"] = [];
  for (const s of plan.scans ?? []) {
    const status = s.status ?? "finalized";
    const violated = new Set((s.violate ?? []).map(idOf));
    const results = steps.map((step) => {
      const verdict = violated.has(step.id) ? ("non_compliant" as const) : ("compliant" as const);
      // Visual steps keep the AI verdict (accepted by finalising); the examiner answers the others.
      return step.visualCheck
        ? { stepId: step.id, aiVerdict: verdict, aiConfidence: 0.9, finalVerdict: null }
        : { stepId: step.id, aiVerdict: null, aiConfidence: null, finalVerdict: verdict };
    });
    const result = scoreScan(steps, results);
    const when = at(s.daysAgo);
    const finalized = status === "finalized";
    const scan = await prisma.scan.create({
      data: {
        organizationId: plan.organizationId,
        teamId: s.team ? teamIds[s.team] : null,
        examinerId: s.examinerId,
        protocolId: protocol.id,
        areaLabel: s.area,
        status,
        score: finalized && result.assessable ? result.score : null,
        riskLevel: finalized ? result.riskLevel : null,
        startedAt: new Date(when.getTime() - 600_000),
        analyzedAt: status === "review" || finalized ? new Date(when.getTime() - 300_000) : null,
        finalizedAt: finalized ? when : null,
        finalizedById: finalized ? s.examinerId : null,
        createdAt: new Date(when.getTime() - 600_000),
        updatedAt: when,
        // A draft has no AI answer yet; a failed analysis left none either.
        stepResults: status === "review" || finalized ? { create: results } : undefined,
      },
    });
    scanIds.push(scan.id);
    scanScores.push(scan.score);
    scanRisks.push(scan.riskLevel);
  }

  const out: SeedResult = {
    scenarioId,
    scenarioSlug,
    protocolId: protocol.id,
    teamIds,
    attemptIds,
    attemptScores,
    attemptRisks,
    scanIds,
    scanScores,
    scanRisks,
    steps: steps.map((s) => ({ id: s.id, key: s.key, textAr: s.textAr, textEn: s.textEn })),
  };
  console.log(JSON.stringify(out));
} catch (err) {
  console.error(`seed-results: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
