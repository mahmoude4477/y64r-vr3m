// Shared by the server actions (lib/account/delete-account.ts) and the settings team's form: no server imports.
// No inline messages: use zodErrorMap (server) / useZodErrorMap (client) as everywhere else (CONVENTIONS 5, 9).
import * as z from "zod";

/** The 6-digit e-mailed code, typed with or without spaces / a hyphen. */
export const deletionCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\d{6}$/));

export const confirmDeletionSchema = z.object({
  code: deletionCodeSchema,
  /** Required when the account has a password (getAccountDeletionInfo().hasPassword); max = PASSWORD_MAX_LENGTH. */
  password: z.string().max(128).optional(),
});

export type ConfirmDeletionInput = z.input<typeof confirmDeletionSchema>;
