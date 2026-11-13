import * as z from "zod";
import { SLUG_PATTERN } from "@/lib/validation/protocol";
import { DIFFICULTIES, type DifficultyValue, type StageKindValue } from "../engine";

/**
 * The scenario editor's content rules (admin, /admin/scenarios), shared by the browser form and the server actions so
 * the two can never disagree. Pure: no database, no session. Field names are the database columns (Scenario,
 * ScenarioStage, ScenarioOption in prisma/schema.prisma).
 *
 * Rules (PRODUCT 3, CONVENTIONS 6):
 * - every text is required in both languages, except a stage's optional context;
 * - a stage has 2..8 options; a "single" stage exactly one correct option, a "multi" stage at least one;
 * - a critical option is a WRONG option linked to the step it breaks (lib/scoring: choosing it violates that step
 *   critically, so a critical flag without a step would change nothing);
 * - a linked step belongs to the scenario's protocol (checked against the protocol's steps);
 * - publishing needs at least one stage (a draft may have none while it is being written).
 *
 * Custom issues carry `params.sim` (a key of simulations.admin.issues) or `params.i18n` (a key of validation.json);
 * `scenarioErrorMap` turns both into text. Schemas carry no inline messages (CONVENTIONS 9).
 */

export const LIMITS = {
  title: 200,
  intro: 600,
  setting: 3000,
  prompt: 600,
  context: 2000,
  optionText: 600,
  feedback: 2000,
  slug: 80,
  minMinutes: 1,
  maxMinutes: 120,
  maxStages: 20,
  minOptions: 2,
  maxOptions: 8,
} as const;

export const STAGE_KINDS = ["single", "multi"] as const satisfies readonly StageKindValue[];

/** Keys of simulations.admin.issues. */
export type IssueKey =
  | "singleNeedsOneCorrect"
  | "multiNeedsCorrect"
  | "needsTwoOptions"
  | "criticalMustBeWrong"
  | "criticalNeedsStep"
  | "stepNotInProtocol"
  | "slugVersionSuffix"
  | "needsStage";

const issue = (key: IssueKey) => ({ params: { sim: key } });

const id = z.string().trim().min(1).max(64);
const text = (max: number) => z.string().trim().min(1).max(max);
/** Optional text: "" means none (stored as null). */
const optionalText = (max: number) => z.string().trim().max(max);

export const optionSchema = z.object({
  textAr: text(LIMITS.optionText),
  textEn: text(LIMITS.optionText),
  isCorrect: z.boolean(),
  /** Choosing this (wrong) option violates its step critically: an automatic high risk. */
  isCritical: z.boolean(),
  /** ProtocolStep.id of the scenario's protocol, or null when the choice says nothing about a step. */
  stepId: id.nullable(),
  feedbackAr: text(LIMITS.feedback),
  feedbackEn: text(LIMITS.feedback),
});

export const stageSchema = z
  .object({
    kind: z.enum(STAGE_KINDS),
    contextAr: optionalText(LIMITS.context),
    contextEn: optionalText(LIMITS.context),
    promptAr: text(LIMITS.prompt),
    promptEn: text(LIMITS.prompt),
    options: z.array(optionSchema).max(LIMITS.maxOptions),
  })
  .superRefine((stage, ctx) => {
    for (const key of stageIssues(stage)) ctx.addIssue({ code: "custom", path: ["options"], ...issue(key) });
    stage.options.forEach((option, index) => {
      if (!option.isCritical) return;
      if (option.isCorrect) ctx.addIssue({ code: "custom", path: ["options", index, "isCritical"], ...issue("criticalMustBeWrong") });
      else if (!option.stepId) ctx.addIssue({ code: "custom", path: ["options", index, "stepId"], ...issue("criticalNeedsStep") });
    });
  });

/** Stage-level rules on the option set (pure, also used by the read-only view and the tests). */
export function stageIssues(stage: { kind: StageKindValue; options: ReadonlyArray<{ isCorrect: boolean }> }): IssueKey[] {
  if (stage.options.length < LIMITS.minOptions) return ["needsTwoOptions"];
  const correct = stage.options.filter((o) => o.isCorrect).length;
  if (stage.kind === "single" && correct !== 1) return ["singleNeedsOneCorrect"];
  if (stage.kind === "multi" && correct < 1) return ["multiNeedsCorrect"];
  return [];
}

export const scenarioMetaSchema = z.object({
  titleAr: text(LIMITS.title),
  titleEn: text(LIMITS.title),
  introAr: text(LIMITS.intro),
  introEn: text(LIMITS.intro),
  settingAr: text(LIMITS.setting),
  settingEn: text(LIMITS.setting),
  protocolId: id,
  difficulty: z.enum(DIFFICULTIES),
  estimatedMinutes: z.number().int().min(LIMITS.minMinutes).max(LIMITS.maxMinutes),
});

/** The steps a protocol offers for option links (undefined: unknown protocol, every link is refused). */
export type StepsOf = (protocolId: string) => ReadonlySet<string> | undefined;

/** The whole editable content of a scenario (meta + ordered stages with ordered options). */
export function scenarioContentSchema(stepsOf: StepsOf) {
  return scenarioMetaSchema.extend({ stages: z.array(stageSchema).max(LIMITS.maxStages) }).superRefine((content, ctx) => {
    const steps = stepsOf(content.protocolId);
    content.stages.forEach((stage, s) =>
      stage.options.forEach((option, o) => {
        if (option.stepId && !steps?.has(option.stepId)) {
          ctx.addIssue({ code: "custom", path: ["stages", s, "options", o, "stepId"], ...issue("stepNotInProtocol") });
        }
      }),
    );
  });
}

export type ScenarioContent = z.output<ReturnType<typeof scenarioContentSchema>>;
export type ScenarioFormValues = z.input<ReturnType<typeof scenarioContentSchema>>;
export type StageValues = ScenarioFormValues["stages"][number];
export type OptionValues = StageValues["options"][number];

/** Rules on top of the content rules before a scenario may be published. */
export function publishIssues(content: { stages: readonly unknown[] }): IssueKey[] {
  return content.stages.length === 0 ? ["needsStage"] : [];
}

// ---------------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------------

const VERSION_SUFFIX = /-v\d+$/;

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.slug)
  .refine((v) => SLUG_PATTERN.test(v), { params: { i18n: "slug" } })
  .refine((v) => !VERSION_SUFFIX.test(v), issue("slugVersionSuffix"));

export const createScenarioSchema = scenarioMetaSchema.extend({
  slug: slugSchema,
  /** null = global (every user); else the institution whose members see it. Fixed after creation. */
  organizationId: id.nullable(),
});

export type CreateScenarioValues = z.input<typeof createScenarioSchema>;
export type CreateScenarioData = z.output<typeof createScenarioSchema>;

/** A URL slug from an (English) title: lowercase ASCII words joined by hyphens, never a version suffix. */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "")
    .replace(VERSION_SUFFIX, "");
}

// ---------------------------------------------------------------------------------------------------
// Versions (CONVENTIONS 6: a scenario with attempts is copied, never edited in place)
// ---------------------------------------------------------------------------------------------------
//
// The schema has no version columns yet (requested from the foundation: Scenario.version + previousVersionId), so a
// version family is told by its slug: "<base>" is version 1 and "<base>-v<N>" (N >= 2) is version N, in the same
// owner (global or one institution). Creation refuses slugs that end in "-v<digits>", so a family cannot be joined
// by accident.

export function versionInfo(slug: string): { base: string; version: number } {
  const match = /^(.+)-v(\d+)$/.exec(slug);
  const version = match ? Number(match[2]) : 1;
  return match && version >= 2 ? { base: match[1], version } : { base: slug, version: 1 };
}

export function inFamily(base: string, slug: string): boolean {
  return versionInfo(slug).base === base;
}

/** The slug and number of the next version, from the slugs that already exist in the family. */
export function nextVersion(base: string, slugs: readonly string[]): { slug: string; version: number } {
  const highest = slugs.filter((s) => inFamily(base, s)).reduce((max, s) => Math.max(max, versionInfo(s).version), 1);
  const version = highest + 1;
  return { slug: `${base}-v${version}`, version };
}

/** Published members of the family other than `targetId`: what publishing `targetId` unpublishes. */
export function versionsToUnpublish(
  targetId: string,
  base: string,
  family: ReadonlyArray<{ id: string; slug: string; isPublished: boolean }>,
): string[] {
  return family.filter((s) => s.id !== targetId && s.isPublished && inFamily(base, s.slug)).map((s) => s.id);
}

/**
 * An existing draft of a later version (unpublished, no attempts, higher number): "create a new version" opens it
 * instead of piling up copies.
 */
export function laterDraft<T extends { slug: string; isPublished: boolean; attempts: number }>(
  source: { slug: string },
  family: readonly T[],
): T | null {
  const { base, version } = versionInfo(source.slug);
  return (
    family
      .filter((s) => inFamily(base, s.slug) && versionInfo(s.slug).version > version && !s.isPublished && s.attempts === 0)
      .sort((a, b) => versionInfo(b.slug).version - versionInfo(a.slug).version)[0] ?? null
  );
}

// ---------------------------------------------------------------------------------------------------
// Database rows <-> form values
// ---------------------------------------------------------------------------------------------------

export type ContentRow = {
  titleAr: string;
  titleEn: string;
  introAr: string;
  introEn: string;
  settingAr: string;
  settingEn: string;
  protocolId: string;
  difficulty: DifficultyValue;
  estimatedMinutes: number;
  stages: Array<{
    kind: StageKindValue;
    contextAr: string | null;
    contextEn: string | null;
    promptAr: string;
    promptEn: string;
    options: Array<{
      textAr: string;
      textEn: string;
      isCorrect: boolean;
      isCritical: boolean;
      stepId: string | null;
      feedbackAr: string;
      feedbackEn: string;
    }>;
  }>;
};

/** Stored rows (stages and options already in order) as editor values. */
export function formValuesFromRow(row: ContentRow): ScenarioFormValues {
  return {
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    introAr: row.introAr,
    introEn: row.introEn,
    settingAr: row.settingAr,
    settingEn: row.settingEn,
    protocolId: row.protocolId,
    difficulty: row.difficulty,
    estimatedMinutes: row.estimatedMinutes,
    stages: row.stages.map((stage) => ({
      kind: stage.kind,
      contextAr: stage.contextAr ?? "",
      contextEn: stage.contextEn ?? "",
      promptAr: stage.promptAr,
      promptEn: stage.promptEn,
      options: stage.options.map((o) => ({
        textAr: o.textAr,
        textEn: o.textEn,
        isCorrect: o.isCorrect,
        isCritical: o.isCritical,
        stepId: o.stepId,
        feedbackAr: o.feedbackAr,
        feedbackEn: o.feedbackEn,
      })),
    })),
  };
}

/** Validated content as the nested create of its stages (order = position, empty context = null). */
export function stagesCreateData(stages: ScenarioContent["stages"]) {
  return stages.map((stage, i) => ({
    order: i + 1,
    kind: stage.kind,
    promptAr: stage.promptAr,
    promptEn: stage.promptEn,
    contextAr: stage.contextAr === "" ? null : stage.contextAr,
    contextEn: stage.contextEn === "" ? null : stage.contextEn,
    options: {
      create: stage.options.map((o, j) => ({
        order: j + 1,
        textAr: o.textAr,
        textEn: o.textEn,
        isCorrect: o.isCorrect,
        // Only a wrong option can be critical (the schema refuses the rest; this keeps stored data clean).
        isCritical: o.isCritical && !o.isCorrect,
        stepId: o.stepId,
        feedbackAr: o.feedbackAr,
        feedbackEn: o.feedbackEn,
      })),
    },
  }));
}

export function emptyOption(isCorrect = false): OptionValues {
  return { textAr: "", textEn: "", isCorrect, isCritical: false, stepId: null, feedbackAr: "", feedbackEn: "" };
}

export function emptyStage(): StageValues {
  return { kind: "single", contextAr: "", contextEn: "", promptAr: "", promptEn: "", options: [emptyOption(true), emptyOption()] };
}

/** Clears option links that point outside `steps` (after the protocol changed); returns how many were cleared. */
export function clearForeignSteps(stages: readonly StageValues[], steps: ReadonlySet<string>): { stages: StageValues[]; cleared: number } {
  let cleared = 0;
  const next = stages.map((stage) => ({
    ...stage,
    options: stage.options.map((o) => {
      if (!o.stepId || steps.has(o.stepId)) return o;
      cleared++;
      return { ...o, stepId: null, isCritical: false };
    }),
  }));
  return { stages: next, cleared };
}
