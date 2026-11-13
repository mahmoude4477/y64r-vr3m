// Schemas of the org pages: the client forms use them, and so does the server gate of Better Auth's organization
// endpoints (lib/org/auth-gates.ts, wired into lib/auth.ts), so a direct API call meets the same rules. Client-safe and
// CLI-safe (zod only). No inline messages: errors come from lib/zod-i18n.ts (zodResolver(schema, { error })).
import * as z from "zod";
import { ORG_ROLES, ORGANIZATION_TYPES } from "@/lib/permissions";
import { emailField } from "@/lib/validation/auth";

export const ORG_NAME_MAX = 120;
export const DEPARTMENT_NAME_MAX = 80;

/** Control characters (U+0000 cannot be stored by Postgres; the others are never part of a name). */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
export const noControlChars = (value: string) => !CONTROL_CHARS.test(value);

/**
 * True when `value` is valid for `schema` AND already in the form the schema produces (parsing changes nothing). The
 * server gates use this, not `safeParse(value).success`: every name schema trims first, so a short name padded with
 * thousands of spaces, U+3000 or newlines passes the length and control-character rules on the trimmed copy, while
 * Better Auth stores the raw body it was given (review round 2, R2-SEC-1). The forms always send the trimmed value.
 */
export function isStoredForm(schema: z.ZodType, value: unknown): boolean {
  const parsed = schema.safeParse(value);
  return parsed.success && parsed.data === value;
}

/** Institution details (name = Arabic name, nameEn = English name, both columns of the organization row). */
export const orgProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(ORG_NAME_MAX)
    .refine(noControlChars, { params: { i18n: "invalidFormat" } }),
  nameEn: z
    .string()
    .trim()
    .max(ORG_NAME_MAX)
    .refine(noControlChars, { params: { i18n: "invalidFormat" } }),
  type: z.enum(ORGANIZATION_TYPES),
});
export type OrgProfileValues = z.input<typeof orgProfileSchema>;

/** Invite by e-mail: role and an optional department ("" = none). */
export const inviteSchema = z.object({
  email: emailField,
  role: z.enum(ORG_ROLES),
  teamId: z.string().max(200),
});
export type InviteValues = z.input<typeof inviteSchema>;

/** A department name as it is stored: trimmed, inner spaces collapsed (the form sends it that way). */
export function normalizeDepartmentName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export const departmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(DEPARTMENT_NAME_MAX)
    .refine(noControlChars, { params: { i18n: "invalidFormat" } }),
});
export type DepartmentValues = z.input<typeof departmentSchema>;

/** A department name exactly as the form sends it and the database keeps it: valid and already normalized. */
export function isStoredDepartmentName(value: unknown): value is string {
  return typeof value === "string" && value === normalizeDepartmentName(value) && isStoredForm(departmentSchema.shape.name, value);
}

/** Case- and space-insensitive duplicate check for department names (Better Auth does not enforce unique names). */
export function sameDepartmentName(a: string, b: string): boolean {
  const norm = (s: string) => normalizeDepartmentName(s).toLocaleLowerCase();
  return norm(a) === norm(b);
}
