// Form and action schemas of /settings (client forms and the Server Actions use the same ones). No inline messages:
// errors come from lib/zod-i18n.ts (zodResolver(schema, { error: useZodErrorMap() }) / safeParse(…, { error })).
import * as z from "zod";
import { routing } from "@/i18n/routing";

// Same limits as the sign-up form (lib/validation/auth.ts signUpSchema), so a name that was accepted once stays valid.
export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const PROFESSION_MAX = 100;

/** Control characters (U+0000 cannot be stored by Postgres; the others are never part of a name). */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const noControlChars = (value: string) => !CONTROL_CHARS.test(value);

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(NAME_MIN)
    .max(NAME_MAX)
    .refine(noControlChars, { params: { i18n: "invalidFormat" } }),
  profession: z
    .string()
    .trim()
    .max(PROFESSION_MAX)
    .refine(noControlChars, { params: { i18n: "invalidFormat" } }),
});
export type ProfileValues = z.input<typeof profileSchema>;

/** The saved language (user.locale): only the app's locales (Better Auth does not check the value itself). */
export const localePreferenceSchema = z.object({ locale: z.enum(routing.locales) });

/** A session row id (Better Auth ids are 32 characters; anything much longer is not one of ours). */
export const sessionIdSchema = z.object({ sessionId: z.string().min(1).max(128) });
