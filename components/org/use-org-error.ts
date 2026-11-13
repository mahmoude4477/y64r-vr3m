"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { type OrgClientError, orgErrorKey } from "@/lib/org/errors";

/** Text for a Better Auth organization error (`{ error }` of authClient.organization.*), or a thrown request. */
export function useOrgErrorText() {
  const t = useTranslations("org.errors");
  return useCallback((error: OrgClientError) => t(orgErrorKey(error)), [t]);
}

export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: OrgClientError };

type ClientError = { status?: number; code?: string; message?: string };

/** Runs a Better Auth client call; a thrown request (offline, aborted) becomes `error: null` = a network error. */
export async function callAuth<T>(call: () => Promise<{ data: T | null; error: ClientError | null }>): Promise<AuthResult<T>> {
  try {
    const { data, error } = await call();
    if (error) return { ok: false, error };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: null };
  }
}

/** The copyable invitation link (same path the invitation e-mail uses: /<locale>/invite/<id>). */
export function invitationUrl(locale: string, invitationId: string): string {
  return `${window.location.origin}/${locale}/invite/${encodeURIComponent(invitationId)}`;
}
