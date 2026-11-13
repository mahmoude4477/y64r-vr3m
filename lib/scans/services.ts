import "server-only";
import { connection } from "next/server";
import { isAiConfigured, scanAiStubAllowed } from "@/lib/ai/model";
import { storageConfiguredAtRequest } from "@/lib/storage";

/**
 * Whether the scan features can run on this server, read at request time (cacheComponents would otherwise freeze an
 * env read into the prerendered shell). AI for scans = Claude configured, or the e2e stub behind its guard.
 */
export function scanAiAvailable(): boolean {
  return isAiConfigured() || scanAiStubAllowed();
}

export async function scanServicesAtRequest(): Promise<{ storage: boolean; ai: boolean }> {
  await connection();
  return { storage: await storageConfiguredAtRequest(), ai: scanAiAvailable() };
}
