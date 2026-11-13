import * as z from "zod";

/**
 * Shared rules for protocols and their steps: the seed (prisma/seed/index.ts), the admin global-protocol
 * editor and the org custom-protocol editor all validate with these, so the three can never disagree.
 * No inline messages (lib/zod-i18n.ts zodErrorMap); custom issues carry `params.i18n` validation keys.
 * Field names are the database columns (ProtocolStep / Protocol in prisma/schema.prisma).
 */

export const PROTOCOL_CATEGORIES = ["safety", "hygiene", "waste", "maintenance", "other"] as const;
export const MIN_STEP_WEIGHT = 1;
export const MAX_STEP_WEIGHT = 3;
export const MAX_STEPS_PER_PROTOCOL = 50;

/** Stable step / protocol slug: lowercase ASCII words joined by single hyphens, e.g. "no-recap". */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugField = z
  .string()
  .min(1)
  .max(80)
  .refine((v) => SLUG_PATTERN.test(v), { params: { i18n: "slug" } });
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const protocolStepSchema = z
  .object({
    key: slugField,
    textAr: text(500),
    textEn: text(500),
    rationaleAr: text(1000),
    rationaleEn: text(1000),
    /** What a photo must show; required in BOTH languages when visualCheck is true. */
    criteriaAr: optionalText(1000),
    criteriaEn: optionalText(1000),
    referenceLabel: optionalText(300),
    // Any valid URL first ("Enter a valid URL"), then https only, with its own message ("starts with https://").
    referenceUrl: z
      .url()
      .max(2000)
      .refine((v) => v.toLowerCase().startsWith("https://"), { params: { i18n: "httpsOnly" } })
      .nullable(),
    isMandatory: z.boolean(),
    /** A violation is an automatic high risk. */
    isCritical: z.boolean(),
    weight: z.number().int().min(MIN_STEP_WEIGHT).max(MAX_STEP_WEIGHT),
    /** Only visual steps go to the scan AI. */
    visualCheck: z.boolean(),
  })
  .superRefine((step, ctx) => {
    if (!step.visualCheck) return;
    for (const field of ["criteriaAr", "criteriaEn"] as const) {
      if (!step[field]) ctx.addIssue({ code: "custom", path: [field], params: { i18n: "visualCriteriaRequired" } });
    }
  });

export type ProtocolStepInput = z.input<typeof protocolStepSchema>;
export type ProtocolStepData = z.output<typeof protocolStepSchema>;

/** Step list rules: 1..50 steps, unique keys (the order is the array order). */
export const protocolStepsSchema = z
  .array(protocolStepSchema)
  .min(1)
  .max(MAX_STEPS_PER_PROTOCOL)
  .superRefine((steps, ctx) => {
    const seen = new Set<string>();
    steps.forEach((step, index) => {
      if (seen.has(step.key)) ctx.addIssue({ code: "custom", path: [index, "key"], params: { i18n: "duplicateStepKey" } });
      seen.add(step.key);
    });
  });

export const protocolSchema = z.object({
  slug: slugField,
  category: z.enum(PROTOCOL_CATEGORIES),
  titleAr: text(200),
  titleEn: text(200),
  summaryAr: text(500),
  summaryEn: text(500),
  descriptionAr: text(4000),
  descriptionEn: text(4000),
  /** lucide-react icon name in kebab-case (components/shared/protocol-icon.tsx) */
  icon: slugField,
  steps: protocolStepsSchema,
});

export type ProtocolInput = z.input<typeof protocolSchema>;
export type ProtocolData = z.output<typeof protocolSchema>;
