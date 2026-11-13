/**
 * Idempotent seed: `pnpm db:seed` (prisma db seed -> tsx prisma/seed/index.ts).
 * - Global protocols (organizationId = null) upserted by slug, their steps by (protocolId, key). A protocol a platform
 *   admin has edited in the app (/admin/protocols: an audit row protocol.update / publish / unpublish / version for
 *   it) is left exactly as it is: the seed never overwrites admins' work. Re-running the seed on production after
 *   admins start editing is therefore safe; new seed protocols are still created.
 * - A step that already has results (scan or simulation results) keeps what it asks for: the seed never changes its
 *   mandatory / critical / weight / photo-check flags (the same rule as the protocol editor, lib/protocols/history.ts),
 *   only its wording.
 * - A step removed from protocols.ts is deleted when nothing references it yet; when it has history
 *   (scan results, simulation results, scenario options) the seed stops with a clear message, because a
 *   stale step would still count in scoring and in the AI checklist.
 * - Global scenarios created by slug (see prisma/seed/scenarios.ts for the update rules).
 * No top-level await: tsx runs this .ts file as CommonJS.
 */
import { prisma } from "../../lib/prisma";
import { protocolSchema } from "../../lib/validation/protocol";
import { type ProtocolSeed, protocols } from "./protocols";
import { type ScenarioSeed, scenarios } from "./scenarios";

/** Same rules as the admin and org protocol editors (lib/validation/protocol.ts). */
function validateProtocols(list: ProtocolSeed[]) {
  const slugs = new Set<string>();
  for (const p of list) {
    if (slugs.has(p.slug)) throw new Error(`duplicate protocol slug ${p.slug}`);
    slugs.add(p.slug);
    const parsed = protocolSchema.safeParse({
      ...p,
      steps: p.steps.map(({ reference, ...step }) => ({ ...step, referenceLabel: reference.label, referenceUrl: reference.url })),
    });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.code === "custom" ? String(i.params?.i18n) : i.message}`);
      throw new Error(`protocol ${p.slug} is invalid:\n  ${issues.join("\n  ")}`);
    }
  }
}

/** Steps in the database that protocols.ts no longer lists: delete unused ones, refuse ones with history. */
async function removeStaleSteps(protocolId: string, p: ProtocolSeed) {
  const stale = await prisma.protocolStep.findMany({
    where: { protocolId, key: { notIn: p.steps.map((s) => s.key) } },
    select: { id: true, key: true, _count: { select: { scanResults: true, simulationResults: true, options: true } } },
  });
  const withHistory = stale.filter((s) => s._count.scanResults + s._count.simulationResults + s._count.options > 0);
  if (withHistory.length > 0) {
    const list = withHistory
      .map((s) => `${s.key} (${s._count.scanResults} scan results, ${s._count.simulationResults} simulation results, ${s._count.options} scenario options)`)
      .join(", ");
    throw new Error(
      `protocol ${p.slug}: step(s) ${list} are no longer in prisma/seed/protocols.ts but already have history. ` +
        "Steps with history are never deleted: put them back in the file, or publish a new protocol version and unpublish this one.",
    );
  }
  if (stale.length > 0) {
    await prisma.protocolStep.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    console.log(`protocol ${p.slug}: removed unused stale step(s) ${stale.map((s) => s.key).join(", ")}`);
  }
}

/** Protocols edited in the app by a platform admin: the seed leaves them alone. */
async function editedInApp(protocolIds: string[]): Promise<Set<string>> {
  if (protocolIds.length === 0) return new Set();
  const rows = await prisma.auditLog.findMany({
    where: {
      targetType: "protocol",
      targetId: { in: protocolIds },
      action: { in: ["protocol.update", "protocol.publish", "protocol.unpublish", "protocol.version"] },
    },
    select: { targetId: true },
    distinct: ["targetId"],
  });
  return new Set(rows.map((r) => r.targetId).filter((id): id is string => typeof id === "string"));
}

async function seedProtocols() {
  validateProtocols(protocols);
  const existing = await prisma.protocol.findMany({
    where: { organizationId: null, slug: { in: protocols.map((p) => p.slug) } },
    select: { id: true, slug: true },
  });
  const edited = await editedInApp(existing.map((e) => e.id));
  const editedSlugs = new Set(existing.filter((e) => edited.has(e.id)).map((e) => e.slug));
  for (const p of protocols) {
    if (editedSlugs.has(p.slug)) {
      console.log(`protocol ${p.slug}: edited in the app, left as it is`);
      continue;
    }
    const content = {
      category: p.category,
      icon: p.icon,
      titleAr: p.titleAr,
      titleEn: p.titleEn,
      summaryAr: p.summaryAr,
      summaryEn: p.summaryEn,
      descriptionAr: p.descriptionAr,
      descriptionEn: p.descriptionEn,
    };
    const protocol = await prisma.protocol.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, organizationId: null, isPublished: true, ...content },
      update: content, // never touches isPublished or organizationId
    });
    await removeStaleSteps(protocol.id, p);
    for (const [index, s] of p.steps.entries()) {
      const step = {
        order: index + 1,
        textAr: s.textAr,
        textEn: s.textEn,
        rationaleAr: s.rationaleAr,
        rationaleEn: s.rationaleEn,
        criteriaAr: s.criteriaAr,
        criteriaEn: s.criteriaEn,
        referenceLabel: s.reference.label,
        referenceUrl: s.reference.url,
        isMandatory: s.isMandatory,
        isCritical: s.isCritical,
        weight: s.weight,
        visualCheck: s.visualCheck,
      };
      const current = await prisma.protocolStep.findUnique({
        where: { protocolId_key: { protocolId: protocol.id, key: s.key } },
        select: { _count: { select: { scanResults: true, simulationResults: true } } },
      });
      const hasResults = current !== null && current._count.scanResults + current._count.simulationResults > 0;
      // A step with results keeps its meaning (past reports were scored with it): wording only.
      const meaning = { isMandatory: s.isMandatory, isCritical: s.isCritical, weight: s.weight, visualCheck: s.visualCheck };
      const wording = Object.fromEntries(Object.entries(step).filter(([k]) => !(k in meaning))) as Omit<typeof step, keyof typeof meaning>;
      await prisma.protocolStep.upsert({
        where: { protocolId_key: { protocolId: protocol.id, key: s.key } },
        create: { protocolId: protocol.id, key: s.key, ...step },
        update: hasResults ? wording : step,
      });
    }
    console.log(`protocol ${p.slug}: ${p.steps.length} steps`);
  }
}

async function seedScenarios(list: ScenarioSeed[]) {
  for (const sc of list) {
    const protocol = await prisma.protocol.findUnique({
      where: { slug: sc.protocolSlug },
      select: { id: true, steps: { select: { id: true, key: true } } },
    });
    if (!protocol) throw new Error(`scenario ${sc.slug}: unknown protocol ${sc.protocolSlug}`);
    const stepIdByKey = new Map(protocol.steps.map((s) => [s.key, s.id]));

    for (const [i, stage] of sc.stages.entries()) {
      const correct = stage.options.filter((o) => o.isCorrect).length;
      if (stage.kind === "single" && correct !== 1) throw new Error(`${sc.slug} stage ${i + 1}: single needs exactly 1 correct option`);
      if (stage.kind === "multi" && correct < 1) throw new Error(`${sc.slug} stage ${i + 1}: multi needs at least 1 correct option`);
      for (const o of stage.options) {
        if (o.stepKey && !stepIdByKey.has(o.stepKey)) throw new Error(`${sc.slug}: unknown stepKey ${o.stepKey}`);
      }
    }

    const fields = {
      titleAr: sc.titleAr,
      titleEn: sc.titleEn,
      introAr: sc.introAr,
      introEn: sc.introEn,
      settingAr: sc.settingAr,
      settingEn: sc.settingEn,
      difficulty: sc.difficulty,
      estimatedMinutes: sc.estimatedMinutes,
    };
    const existing = await prisma.scenario.findUnique({ where: { slug: sc.slug }, select: { id: true } });
    if (existing) {
      await prisma.scenario.update({ where: { id: existing.id }, data: fields });
      console.log(`scenario ${sc.slug}: exists, fields updated, stages kept`);
      continue;
    }
    await prisma.scenario.create({
      data: {
        slug: sc.slug,
        protocolId: protocol.id,
        organizationId: null,
        isPublished: sc.isPublished ?? true,
        ...fields,
        stages: {
          create: sc.stages.map((stage, i) => ({
            order: i + 1,
            kind: stage.kind,
            promptAr: stage.promptAr,
            promptEn: stage.promptEn,
            contextAr: stage.contextAr ?? null,
            contextEn: stage.contextEn ?? null,
            options: {
              create: stage.options.map((o, j) => ({
                order: j + 1,
                textAr: o.textAr,
                textEn: o.textEn,
                isCorrect: o.isCorrect,
                isCritical: o.isCritical ?? false,
                stepId: o.stepKey ? (stepIdByKey.get(o.stepKey) ?? null) : null,
                feedbackAr: o.feedbackAr,
                feedbackEn: o.feedbackEn,
              })),
            },
          })),
        },
      },
    });
    console.log(`scenario ${sc.slug}: created with ${sc.stages.length} stages`);
  }
}

async function main() {
  await seedProtocols();
  await seedScenarios(scenarios);
  console.log(`seed done: ${protocols.length} protocols, ${scenarios.length} scenarios`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
