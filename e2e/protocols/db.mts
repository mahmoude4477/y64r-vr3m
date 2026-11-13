/**
 * Test data for the protocol library specs (e2e/protocols/*.spec.ts), written straight to the e2e database:
 * the editors that would create it (institution protocols, scenarios) are other pages. Run by support.ts as
 *   DATABASE_URL=<e2e database> tsx e2e/protocols/db.mts   (JSON actions on stdin, JSON result on stdout)
 * Every row it creates has a slug starting with "e2e-", and specs delete their rows afterwards.
 * Never point it at a real database: it refuses anything but a loopback host.
 */
import { prisma } from "../../lib/prisma";

type Action =
  | {
      type: "copyProtocol";
      sourceSlug: string;
      slug: string;
      organizationId: string;
      isPublished: boolean;
      titleAr: string;
      titleEn: string;
    }
  | { type: "orgProtocol"; slug: string; organizationId: string; isPublished: boolean; titleAr: string; titleEn: string }
  | { type: "globalProtocol"; slug: string; isPublished: boolean; titleAr: string; titleEn: string }
  | {
      type: "scenario";
      slug: string;
      protocolSlug: string;
      organizationId: string | null;
      isPublished: boolean;
      titleAr: string;
      titleEn: string;
    }
  /** A finalised scan of the protocol in an institution, with one compliant result on step `stepNumber` (1-based). */
  | { type: "scanResult"; protocolSlug: string; organizationId: string; stepNumber: number }
  | { type: "delete"; protocolSlugs: string[]; scenarioSlugs: string[] };

function assertTestSlug(slug: string) {
  if (!/^e2e-[a-z0-9-]+$/.test(slug)) throw new Error(`test rows need an "e2e-" slug, got ${slug}`);
}

function assertLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("e2e/protocols/db.mts runs on a local database only");
}

const step = (key: string, order: number, over: Record<string, unknown> = {}) => ({
  key,
  order,
  textAr: `خطوة اختبار ${order}`,
  textEn: `Test step ${order}`,
  rationaleAr: "سبب الخطوة.",
  rationaleEn: "Why the step matters.",
  criteriaAr: null,
  criteriaEn: null,
  referenceLabel: "WHO Guidelines on Hand Hygiene in Health Care (2009)",
  referenceUrl: "https://www.who.int/publications/i/item/9789241597906",
  isMandatory: true,
  isCritical: false,
  weight: 1,
  visualCheck: false,
  ...over,
});

function freshProtocol(slug: string, organizationId: string | null, isPublished: boolean, titleAr: string, titleEn: string) {
  return prisma.protocol.create({
    data: {
      slug,
      organizationId,
      isPublished,
      category: "other",
      icon: "book-open-check",
      titleAr,
      titleEn,
      summaryAr: "بروتوكول أُنشئ للاختبار.",
      summaryEn: "A protocol created for a test.",
      descriptionAr: "وصف بروتوكول الاختبار.",
      descriptionEn: "Description of the test protocol.",
      steps: { create: [step("first", 1, { isCritical: true, weight: 3 }), step("second", 2, { isMandatory: false })] },
    },
    select: { id: true },
  });
}

async function run(action: Action, out: { protocols: Record<string, string>; scenarios: Record<string, string> }) {
  switch (action.type) {
    case "copyProtocol": {
      assertTestSlug(action.slug);
      const source = await prisma.protocol.findUniqueOrThrow({ where: { slug: action.sourceSlug }, include: { steps: true } });
      const created = await prisma.protocol.create({
        data: {
          slug: action.slug,
          organizationId: action.organizationId,
          sourceProtocolId: source.id,
          isPublished: action.isPublished,
          category: source.category,
          icon: source.icon,
          titleAr: action.titleAr,
          titleEn: action.titleEn,
          summaryAr: source.summaryAr,
          summaryEn: source.summaryEn,
          descriptionAr: source.descriptionAr,
          descriptionEn: source.descriptionEn,
          steps: {
            create: source.steps.map((s) => ({
              key: s.key,
              order: s.order,
              textAr: s.textAr,
              textEn: s.textEn,
              rationaleAr: s.rationaleAr,
              rationaleEn: s.rationaleEn,
              criteriaAr: s.criteriaAr,
              criteriaEn: s.criteriaEn,
              referenceLabel: s.referenceLabel,
              referenceUrl: s.referenceUrl,
              isMandatory: s.isMandatory,
              isCritical: s.isCritical,
              weight: s.weight,
              visualCheck: s.visualCheck,
            })),
          },
        },
        select: { id: true },
      });
      out.protocols[action.slug] = created.id;
      return;
    }
    case "orgProtocol":
    case "globalProtocol": {
      assertTestSlug(action.slug);
      const organizationId = action.type === "orgProtocol" ? action.organizationId : null;
      const created = await freshProtocol(action.slug, organizationId, action.isPublished, action.titleAr, action.titleEn);
      out.protocols[action.slug] = created.id;
      return;
    }
    case "scenario": {
      assertTestSlug(action.slug);
      const protocol = await prisma.protocol.findUniqueOrThrow({
        where: { slug: action.protocolSlug },
        select: { id: true, steps: { orderBy: { order: "asc" }, select: { id: true }, take: 1 } },
      });
      const created = await prisma.scenario.create({
        data: {
          slug: action.slug,
          protocolId: protocol.id,
          organizationId: action.organizationId,
          isPublished: action.isPublished,
          titleAr: action.titleAr,
          titleEn: action.titleEn,
          introAr: "موقف تدريبي قصير أُنشئ للاختبار.",
          introEn: "A short training situation created for a test.",
          settingAr: "غرفة مريض",
          settingEn: "Patient room",
          difficulty: "beginner",
          estimatedMinutes: 4,
          stages: {
            create: [
              {
                order: 1,
                kind: "single",
                promptAr: "ماذا تفعل أولًا؟",
                promptEn: "What do you do first?",
                options: {
                  create: [
                    { order: 1, textAr: "الصواب", textEn: "Right", isCorrect: true, stepId: protocol.steps[0]?.id ?? null, feedbackAr: "صحيح.", feedbackEn: "Correct." },
                    { order: 2, textAr: "الخطأ", textEn: "Wrong", isCorrect: false, stepId: protocol.steps[0]?.id ?? null, feedbackAr: "خطأ.", feedbackEn: "Wrong." },
                  ],
                },
              },
            ],
          },
        },
        select: { id: true },
      });
      out.scenarios[action.slug] = created.id;
      return;
    }
    case "scanResult": {
      assertTestSlug(action.protocolSlug);
      const protocol = await prisma.protocol.findUniqueOrThrow({
        where: { slug: action.protocolSlug },
        select: { id: true, steps: { orderBy: { order: "asc" }, select: { id: true } } },
      });
      const step = protocol.steps[action.stepNumber - 1];
      if (!step) throw new Error(`no step ${action.stepNumber} in ${action.protocolSlug}`);
      await prisma.scan.create({
        data: {
          organizationId: action.organizationId,
          protocolId: protocol.id,
          areaLabel: "e2e test area",
          status: "finalized",
          score: 100,
          riskLevel: "low",
          analyzedAt: new Date(),
          finalizedAt: new Date(),
          stepResults: { create: [{ stepId: step.id, aiVerdict: "compliant", finalVerdict: "compliant" }] },
        },
        select: { id: true },
      });
      return;
    }
    case "delete": {
      for (const slug of [...action.protocolSlugs, ...action.scenarioSlugs]) assertTestSlug(slug);
      // Scans first (RESTRICT on the protocol and its steps; their step results cascade), then scenarios (they
      // reference protocols; stages and options cascade), then the protocols (steps cascade).
      await prisma.scan.deleteMany({ where: { protocol: { slug: { in: action.protocolSlugs } } } });
      await prisma.scenario.deleteMany({ where: { slug: { in: action.scenarioSlugs } } });
      await prisma.scenario.deleteMany({ where: { protocol: { slug: { in: action.protocolSlugs } } } });
      await prisma.protocol.deleteMany({ where: { slug: { in: action.protocolSlugs } } });
      return;
    }
  }
}

async function main() {
  assertLocalDatabase();
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const actions = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Action[];
  const out = { protocols: {} as Record<string, string>, scenarios: {} as Record<string, string> };
  for (const action of actions) await run(action, out);
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
