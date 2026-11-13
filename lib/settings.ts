import "server-only";
import * as z from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Admin-editable settings stored in AppSetting (key -> JSON value). Env vars are the defaults;
 * a row overrides them. The admin "AI & settings" page writes these with setSetting().
 */
/** Days a scan's photos are kept after the scan is finalised; then the daily job deletes them (PRODUCT 9). */
export const DEFAULT_PHOTO_RETENTION_DAYS = 90;
export const MIN_PHOTO_RETENTION_DAYS = 1;
export const MAX_PHOTO_RETENTION_DAYS = 3650;

export const SETTINGS = {
  "ai.dailyLimitPerUser": z.number().int().min(0).max(10_000),
  "ai.model": z.string().regex(/^claude-[a-z0-9.-]+$/),
  "ai.effort": z.enum(["low", "medium", "high", "xhigh", "max"]),
  "scans.photoRetentionDays": z.number().int().min(MIN_PHOTO_RETENTION_DAYS).max(MAX_PHOTO_RETENTION_DAYS),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]>;

/**
 * Photo retention in days: AppSetting "scans.photoRetentionDays" -> env PHOTO_RETENTION_DAYS -> 90.
 * Read by the daily purge job (scripts/purge-photos.mts) and shown in the admin panel.
 *
 * Strict on purpose, unlike getSetting(): a job that DELETES photos must never guess. A database error, an
 * invalid stored value or an invalid PHOTO_RETENTION_DAYS throws instead of falling back to the default.
 */
export async function getPhotoRetentionDays(): Promise<number> {
  const key = "scans.photoRetentionDays" satisfies SettingKey;
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (row) {
    const stored = SETTINGS[key].safeParse(row.value);
    if (!stored.success) throw new Error(`Invalid stored setting ${key}`);
    return stored.data;
  }
  return parsePhotoRetentionDays(process.env.PHOTO_RETENTION_DAYS);
}

/** The env fallback: unset or blank -> 90; otherwise a whole number of days in range, or it throws. */
export function parsePhotoRetentionDays(raw: string | undefined): number {
  const text = raw?.trim();
  if (!text) return DEFAULT_PHOTO_RETENTION_DAYS;
  const parsed = SETTINGS["scans.photoRetentionDays"].safeParse(/^\d+$/.test(text) ? Number(text) : Number.NaN);
  if (!parsed.success) {
    throw new Error(
      `PHOTO_RETENTION_DAYS must be a whole number from ${MIN_PHOTO_RETENTION_DAYS} to ${MAX_PHOTO_RETENTION_DAYS}`,
    );
  }
  return parsed.data;
}

/** The stored value, or undefined when unset / invalid / the database is unreachable. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K> | undefined> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row) return undefined;
    const parsed = SETTINGS[key].safeParse(row.value);
    return parsed.success ? (parsed.data as SettingValue<K>) : undefined;
  } catch {
    return undefined;
  }
}

/** Validates and stores a setting. Pair it with writeAudit(ctx, "setting.update", ...). */
export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>, updatedById: string | null) {
  const parsed = SETTINGS[key].parse(value) as Prisma.InputJsonValue;
  return prisma.appSetting.upsert({
    where: { key },
    create: { key, value: parsed, updatedById },
    update: { value: parsed, updatedById },
  });
}
