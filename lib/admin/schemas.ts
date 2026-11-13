// Form and action input schemas of the admin panel. Shared by the forms (zodResolver) and the Server Actions
// (safeParse), so both check the same rules. No inline messages: errors come from lib/zod-i18n.ts.
import * as z from "zod";
import { DELETE_REASONS } from "@/lib/admin/assessment-filters";
import { ORG_ROLES, ORGANIZATION_TYPES } from "@/lib/permissions";

export const ORG_NAME_MAX = 120;
export const BAN_REASON_MAX = 300;
export const EMAIL_MAX = 254;
/** Ban lengths offered in the form (days); "permanent" = no expiry. */
export const BAN_DURATIONS = ["1", "7", "30", "90", "permanent"] as const;
export type BanDuration = (typeof BAN_DURATIONS)[number];

const id = z.string().trim().min(1).max(128);
const name = z.string().trim().min(2).max(ORG_NAME_MAX);
const isEmail = (value: string) => z.email().safeParse(value).success;
const email = z.string().trim().toLowerCase().min(1).max(EMAIL_MAX).refine(isEmail, { params: { i18n: "email" } });
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX)
  .refine((v) => v === "" || isEmail(v), { params: { i18n: "email" } });

export const organizationProfileSchema = z.object({
  nameAr: name,
  nameEn: name,
  type: z.enum(ORGANIZATION_TYPES),
});
export type OrganizationProfileValues = z.input<typeof organizationProfileSchema>;

export const createOrganizationSchema = organizationProfileSchema.extend({
  /** The first owner, invited by e-mail ("" = invite later). */
  ownerEmail: optionalEmail,
});
export type CreateOrganizationValues = z.input<typeof createOrganizationSchema>;

export const updateOrganizationSchema = organizationProfileSchema.extend({ organizationId: id });

export const organizationIdSchema = z.object({ organizationId: id });

export const suspendOrganizationSchema = z.object({ organizationId: id, suspended: z.boolean() });

export const deleteOrganizationSchema = z.object({ organizationId: id, confirmName: z.string().trim().min(1).max(ORG_NAME_MAX) });

export const memberRoleSchema = z.object({ organizationId: id, memberId: id, role: z.enum(ORG_ROLES) });

export const memberSchema = z.object({ organizationId: id, memberId: id });

export const invitationSchema = z.object({ organizationId: id, invitationId: id });

export const inviteSchema = z.object({ organizationId: id, email, role: z.enum(ORG_ROLES) });
export const inviteFormSchema = inviteSchema.omit({ organizationId: true });
export type InviteFormValues = z.input<typeof inviteFormSchema>;

export const userIdSchema = z.object({ userId: id });

export const setRoleSchema = z.object({ userId: id, role: z.enum(["user", "admin", "protocol_editor"]) });

export const banSchema = z.object({
  userId: id,
  reason: z.string().trim().min(3).max(BAN_REASON_MAX),
  duration: z.enum(BAN_DURATIONS),
});
export const banFormSchema = banSchema.omit({ userId: true });
export type BanFormValues = z.input<typeof banFormSchema>;

export const revokeSessionSchema = z.object({ userId: id, sessionId: id });

export const removeUserSchema = z.object({ userId: id, confirmEmail: z.string().trim().min(1).max(EMAIL_MAX) });

/** Seconds for Better Auth's banExpiresIn, or undefined for a ban without end. */
export function banExpiresInSeconds(duration: BanDuration): number | undefined {
  return duration === "permanent" ? undefined : Number(duration) * 24 * 60 * 60;
}

/** Typed confirmations ignore case and surrounding spaces (an e-mail address or an institution name). */
export function confirmationMatches(typed: string, ...expected: Array<string | null | undefined>): boolean {
  const t = typed.trim().toLocaleLowerCase();
  return t.length > 0 && expected.some((e) => !!e && e.trim().toLocaleLowerCase() === t);
}

// Assessments (/admin/assessments): deleting a scan or an attempt needs a reason from a fixed list (stored in the
// audit row; free text about people never goes there).
export const deleteScanSchema = z.object({ scanId: id, reason: z.enum(DELETE_REASONS) });
export const deleteAttemptSchema = z.object({ attemptId: id, reason: z.enum(DELETE_REASONS) });

// AI settings (/admin/ai). The same rules as SETTINGS in lib/settings.ts (server-only there; lib/admin/schemas.test.ts
// checks that both agree), so the forms can validate in the browser too.
export const AI_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh", "max"] as const;
export const AI_DAILY_LIMIT_MAX = 10_000;
export const AI_MODEL_MAX = 100;

export const aiModelFormSchema = z.object({
  model: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(AI_MODEL_MAX)
    .regex(/^claude-[a-z0-9.-]+$/),
});
export const aiEffortFormSchema = z.object({ effort: z.enum(AI_EFFORT_OPTIONS) });
export const aiDailyLimitFormSchema = z.object({ limit: z.number().int().min(0).max(AI_DAILY_LIMIT_MAX) });
export type AiModelFormValues = z.input<typeof aiModelFormSchema>;
export type AiEffortFormValues = z.input<typeof aiEffortFormSchema>;
export type AiDailyLimitFormValues = z.input<typeof aiDailyLimitFormSchema>;

export const AI_SETTING_KEYS = ["ai.model", "ai.effort", "ai.dailyLimitPerUser"] as const;
export type AiSettingKey = (typeof AI_SETTING_KEYS)[number];

export const aiSettingSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("ai.model"), value: aiModelFormSchema.shape.model }),
  z.object({ key: z.literal("ai.effort"), value: aiEffortFormSchema.shape.effort }),
  z.object({ key: z.literal("ai.dailyLimitPerUser"), value: aiDailyLimitFormSchema.shape.limit }),
]);
export const aiSettingResetSchema = z.object({ key: z.enum(AI_SETTING_KEYS) });
