/**
 * E2E ONLY: test data for the admin assessments and AI specs (e2e/admin/assessments.spec.ts, ai.spec.ts), written
 * straight into the e2e database: the scan and simulation flows are built by other teams at the same time, so no UI
 * can produce them yet. One institution of its own per run with an examiner and a trainee (plain rows: they never
 * sign in), a finalised scan with photo rows (keys that exist in no bucket) and a scan in review, an attempt on the
 * institution's own unpublished scenario, and AI calls in every state.
 *
 *   echo '{"tag":"ab12"}' | ADMIN_SEED_DATABASE_URL=postgresql://…/waqaya_e2e_admin pnpm exec tsx e2e/admin/seed-assessments.mts
 *
 * Prints one JSON line with the ids. Scores and risk come from lib/scoring.ts, like the real features store them.
 * Never reads .env files; refuses a database that is not local or whose name does not contain "e2e".
 */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { scoreScan, scoreSimulation, simulationStepOutcomes } from "../../lib/scoring";

const url = process.env.ADMIN_SEED_DATABASE_URL ?? "";
function refuse(message: string): never {
  console.error(`seed-assessments: ${message}`);
  process.exit(2);
}
let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  refuse("ADMIN_SEED_DATABASE_URL is required");
}
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) refuse("only a local test database is allowed");
if (!/e2e/i.test(parsed.pathname)) refuse("refusing a database whose name does not contain e2e");

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const plan = JSON.parse((await readStdin()) || "{}") as { tag?: string };
const tag = (plan.tag ?? randomUUID().slice(0, 8)).replace(/[^a-z0-9]/gi, "").slice(0, 12) || "e2e";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
const MIN = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MIN);
const id = () => randomUUID().replace(/-/g, "").slice(0, 24);

try {
  const sharps = await prisma.protocol.findFirstOrThrow({
    where: { slug: "sharps-safety", organizationId: null },
    select: {
      id: true,
      steps: { orderBy: { order: "asc" }, select: { id: true, weight: true, isMandatory: true, isCritical: true, visualCheck: true } },
    },
  });
  const waste = await prisma.protocol.findFirstOrThrow({
    where: { slug: "waste-management", organizationId: null },
    select: { id: true, steps: { orderBy: { order: "asc" }, select: { id: true } } },
  });

  const organization = await prisma.organization.create({
    data: {
      id: id(),
      name: `مستشفى التقييمات ${tag}`,
      nameEn: `Assessments Hospital ${tag}`,
      slug: `e2e-assessments-${tag}-${id().slice(0, 6)}`,
      type: "hospital",
      createdAt: new Date(),
    },
    select: { id: true, name: true, nameEn: true },
  });
  const person = (role: string, name: string) =>
    prisma.user.create({
      data: { id: id(), name, email: `e2e-${role}-${tag}-${id().slice(0, 6)}@example.com`, emailVerified: true },
      select: { id: true, name: true },
    });
  const examiner = await person("examiner", `فاحص ${tag}`);
  const trainee = await person("trainee", `متدرب ${tag}`);

  // A finalised scan: the AI judged the visual steps, the examiner answered the rest and changed one verdict.
  const results = sharps.steps.map((s, i) => ({
    stepId: s.id,
    aiVerdict: s.visualCheck ? (i % 3 === 1 ? ("non_compliant" as const) : ("compliant" as const)) : null,
    aiConfidence: s.visualCheck ? 0.82 : null,
    evidenceAr: s.visualCheck ? "تظهر الحاوية في الصورة." : null,
    evidenceEn: s.visualCheck ? "The container is visible in the photo." : null,
    finalVerdict: i === 0 ? ("non_compliant" as const) : s.visualCheck ? null : ("compliant" as const),
    overriddenById: i === 0 ? examiner.id : null,
    note: i === 0 ? "الغطاء مفتوح" : null,
  }));
  const score = scoreScan(sharps.steps, results);
  const finalized = await prisma.scan.create({
    data: {
      organizationId: organization.id,
      examinerId: examiner.id,
      protocolId: sharps.id,
      areaLabel: `غرفة العلاج ${tag}`,
      status: "finalized",
      aiModel: "claude-opus-5-5",
      overallNotesAr: "حاوية الأدوات الحادة ممتلئة حتى ثلثيها.",
      overallNotesEn: "The sharps container is two thirds full.",
      score: score.assessable ? score.score : null,
      riskLevel: score.riskLevel,
      startedAt: ago(90),
      analyzedAt: ago(85),
      finalizedAt: ago(80),
      finalizedById: examiner.id,
      notes: "تمت المراجعة مع رئيسة التمريض.",
      createdAt: ago(90),
      stepResults: { createMany: { data: results } },
      photos: {
        create: [1, 2].map((n) => ({
          organizationId: organization.id,
          uploadedById: examiner.id,
          storageKey: `orgs/${organization.id}/e2e-missing/${randomUUID()}-${n}.jpg`,
          mime: "image/jpeg",
          bytes: 1000,
          width: 800,
          height: 600,
        })),
      },
    },
    select: { id: true, areaLabel: true, score: true, riskLevel: true },
  });
  const inReview = await prisma.scan.create({
    data: {
      organizationId: organization.id,
      examinerId: examiner.id,
      protocolId: waste.id,
      areaLabel: `ممر النفايات ${tag}`,
      status: "review",
      createdAt: ago(30),
      startedAt: ago(30),
      stepResults: { createMany: { data: waste.steps.map((s) => ({ stepId: s.id })) } },
    },
    select: { id: true, areaLabel: true },
  });

  // The institution's own scenario (unpublished: no catalogue shows it) with two stages mapped to the protocol steps.
  const [stepA, stepB] = sharps.steps;
  const scenario = await prisma.scenario.create({
    data: {
      slug: `e2e-admin-${tag}-${id().slice(0, 6)}`,
      protocolId: sharps.id,
      organizationId: organization.id,
      titleAr: `إبرة مستعملة بعد الحقن ${tag}`,
      titleEn: `A used needle after an injection ${tag}`,
      introAr: "سيناريو اختبار",
      introEn: "Test scenario",
      settingAr: "غرفة مريض",
      settingEn: "Patient room",
      isPublished: false,
      stages: {
        create: [
          {
            order: 1,
            kind: "single",
            promptAr: "ماذا تفعل بالإبرة بعد الحقن مباشرة؟",
            promptEn: "What do you do with the needle right after the injection?",
            options: {
              create: [
                { order: 1, textAr: "أضعها في حاوية الأدوات الحادة فورًا", textEn: "Put it in the sharps container at once", isCorrect: true, stepId: stepA.id, feedbackAr: "صحيح.", feedbackEn: "Correct." },
                { order: 2, textAr: "أعيد تغطيتها بيديّ", textEn: "Recap it with both hands", isCorrect: false, isCritical: true, stepId: stepA.id, feedbackAr: "إعادة التغطية تسبب وخز الإبر.", feedbackEn: "Recapping causes needlestick injuries." },
              ],
            },
          },
          {
            order: 2,
            kind: "multi",
            promptAr: "متى تُستبدل الحاوية؟",
            promptEn: "When is the container replaced?",
            options: {
              create: [
                { order: 1, textAr: "عند امتلاء ثلاثة أرباعها", textEn: "When it is three quarters full", isCorrect: true, stepId: stepB.id, feedbackAr: "صحيح.", feedbackEn: "Correct." },
                { order: 2, textAr: "عند امتلائها تمامًا", textEn: "When it is completely full", isCorrect: false, stepId: stepB.id, feedbackAr: "متأخر جدًا.", feedbackEn: "Too late." },
              ],
            },
          },
        ],
      },
    },
    select: { id: true, titleAr: true, titleEn: true, stages: { orderBy: { order: "asc" }, select: { id: true, options: { orderBy: { order: "asc" }, select: { id: true, stageId: true, stepId: true, isCorrect: true, isCritical: true } } } } },
  });
  const options = scenario.stages.flatMap((s) => s.options);
  // Stage 1 right, stage 2 wrong (the "completely full" option).
  const answers = [
    { stageId: scenario.stages[0].id, optionIds: [scenario.stages[0].options[0].id] },
    { stageId: scenario.stages[1].id, optionIds: [scenario.stages[1].options[1].id] },
  ];
  const outcomes = simulationStepOutcomes({ options, answers });
  const result = scoreSimulation(sharps.steps, outcomes);
  const attempt = await prisma.simulationAttempt.create({
    data: {
      userId: trainee.id,
      organizationId: organization.id,
      scenarioId: scenario.id,
      status: "completed",
      startedAt: ago(70),
      completedAt: ago(62),
      durationSec: 8 * 60,
      score: result.assessable ? result.score : null,
      riskLevel: result.riskLevel,
      debriefAr: "أحسنت في التخلص من الإبرة فورًا. راجع متى تُستبدل الحاوية.",
      answers: {
        create: answers.map((a, i) => ({
          stageId: a.stageId,
          optionIds: a.optionIds,
          isCorrect: i === 0,
        })),
      },
      stepResults: { create: outcomes.map((o) => ({ stepId: o.stepId, compliant: o.compliant, critical: o.critical })) },
    },
    select: { id: true, score: true, riskLevel: true },
  });

  // AI calls in every state, for this institution only (the specs filter by it).
  const base = { userId: examiner.id, organizationId: organization.id, model: "claude-opus-5-5" };
  await prisma.aiCall.createMany({
    data: [
      { ...base, kind: "scan_analysis", status: "ok", inputTokens: 5200, outputTokens: 900, costUsd: "0.038800", latencyMs: 14_200, targetType: "scan", targetId: finalized.id, createdAt: ago(85) },
      { ...base, kind: "scan_analysis", status: "error", errorCode: "overloaded", latencyMs: 1_200, targetType: "scan", targetId: inReview.id, createdAt: ago(29) },
      { ...base, kind: "scan_analysis", status: "refused", errorCode: "refused", inputTokens: 4000, outputTokens: 20, costUsd: "0.016400", latencyMs: 6_000, targetType: "scan", targetId: inReview.id, createdAt: ago(28) },
      { ...base, userId: trainee.id, kind: "simulation_debrief", status: "ok", inputTokens: 800, outputTokens: 300, costUsd: "0.009200", latencyMs: 4_100, targetType: "simulation_attempt", targetId: attempt.id, createdAt: ago(61) },
      { ...base, kind: "scan_analysis", status: "pending", targetType: "scan", targetId: inReview.id, createdAt: ago(1) },
      { ...base, kind: "scan_analysis", status: "pending", targetType: "scan", targetId: inReview.id, createdAt: ago(45) },
    ],
  });

  console.log(
    JSON.stringify({
      organization,
      examiner,
      trainee,
      scans: { finalized, inReview },
      scenario: { id: scenario.id, titleAr: scenario.titleAr, titleEn: scenario.titleEn },
      attempt,
    }),
  );
} finally {
  await prisma.$disconnect();
}
