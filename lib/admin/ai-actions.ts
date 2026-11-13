"use server";

import { attempt, badLocale, DB_FAILED, failure, revalidateAdmin, type ActionResult } from "@/lib/admin/action-result";
import { aiSettingResetSchema, aiSettingSchema } from "@/lib/admin/schemas";
import { isAppLocale } from "@/i18n/routing";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/session";
import { SETTINGS, type SettingKey } from "@/lib/settings";

// Platform-admin AI settings (/admin/ai, PRODUCT 6a): model id, effort and the per-user daily limit. They take effect
// on the next model call (lib/ai/model.ts getAiConfig and lib/ai/limits.ts read them on every call). Each change writes
// "setting.update" with the old and the new value (model ids, effort names and numbers only: nothing secret).
// The photo-retention setting is postponed (2026-10-29) and is not offered here.
//
// The write and its audit row are ONE transaction (writeAudit with { tx } throws, so a change never commits without
// its row), under a per-key advisory lock so two admins saving at once each record the value they really replaced.
// The value is validated with the SETTINGS rules of lib/settings.ts (what setSetting and the readers use).

type Tx = Prisma.TransactionClient;

async function lockSetting(tx: Tx, key: SettingKey) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`setting:${key}`}, 0))`;
}

/** The stored value (null when unset or no longer valid): the "from" of the audit row. */
async function storedValue(tx: Tx, key: SettingKey): Promise<Prisma.InputJsonValue | null> {
  const row = await tx.appSetting.findUnique({ where: { key }, select: { value: true } });
  if (!row) return null;
  const parsed = SETTINGS[key].safeParse(row.value);
  return parsed.success ? (parsed.data as Prisma.InputJsonValue) : null;
}

export async function updateAiSettingAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = aiSettingSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { key } = parsed.data;
  const value = SETTINGS[key].parse(parsed.data.value) as Prisma.InputJsonValue;
  const done = await attempt("admin.setting.update_failed", () =>
    prisma.$transaction(async (tx) => {
      await lockSetting(tx, key);
      const previous = await storedValue(tx, key);
      await tx.appSetting.upsert({
        where: { key },
        create: { key, value, updatedById: ctx.user.id },
        update: { value, updatedById: ctx.user.id },
      });
      await writeAudit(ctx, "setting.update", { type: "setting", id: key }, { key, from: previous, to: value }, { tx });
      return true;
    }),
  );
  if (done === DB_FAILED) return failure(locale, "generic");
  revalidateAdmin(locale);
  return { ok: true };
}

/** Removes the panel value, so the server's environment variable (or the built-in default) applies again. */
export async function resetAiSettingAction(locale: string, input: unknown): Promise<ActionResult> {
  if (!isAppLocale(locale)) return badLocale();
  const parsed = aiSettingResetSchema.safeParse(input);
  if (!parsed.success) return failure(locale, "invalidInput");
  const ctx = await requirePlatformAdmin();
  const { key } = parsed.data;
  const done = await attempt("admin.setting.reset_failed", () =>
    prisma.$transaction(async (tx) => {
      await lockSetting(tx, key);
      const previous = await storedValue(tx, key);
      const removed = await tx.appSetting.deleteMany({ where: { key } });
      if (removed.count > 0) await writeAudit(ctx, "setting.reset", { type: "setting", id: key }, { key, from: previous }, { tx });
      return true;
    }),
  );
  if (done === DB_FAILED) return failure(locale, "generic");
  revalidateAdmin(locale);
  return { ok: true };
}
