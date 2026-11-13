"use client";

import { useLocale, useTranslations } from "next-intl";
import { startTransition, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/admin/action-result";

type AdminAction<T extends object> = (locale: string, input: unknown) => Promise<ActionResult<T>>;

export type RunResult<T extends object> = ({ ok: true } & T) | { ok: false; message: string; error?: string; redirected?: boolean };

/** The text to show for a result (null on success, and when Next is already redirecting). */
export function errorOf(result: { ok: boolean; message?: string; redirected?: boolean }): string | null {
  if (result.ok || result.redirected) return null;
  return result.message || null;
}

/** Next's redirect error (digest "NEXT_REDIRECT;…", e.g. an expired session sent to sign-in): the router navigates. */
const isRedirect = (e: unknown) =>
  typeof e === "object" && e !== null && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");

/** Runs the action inside a React transition (how Next applies the page re-render that comes with its answer). */
function inTransition<R>(fn: () => Promise<R>): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    startTransition(async () => {
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Calls an admin Server Action with the page locale. On success it shows `success` as a toast and refreshes the
 * current page (the action also revalidates /admin; the refresh makes sure the page shows the change even when the
 * re-render of the action's own answer is dropped, which the e2e runs caught under load). Pass `refresh: false` when
 * the caller navigates away (a deleted user or institution has no page left to refresh). On failure it returns the
 * translated message for the caller to show next to the control (dialogs keep it inside, lists toast it).
 */
export function useAdminAction() {
  const locale = useLocale();
  const t = useTranslations("admin.errors");
  const router = useRouter();
  return useCallback(
    async <T extends object>(
      action: AdminAction<T>,
      input: unknown,
      success?: string,
      options?: { refresh?: boolean },
    ): Promise<RunResult<T>> => {
      let result: ActionResult<T>;
      try {
        result = await inTransition(() => action(locale, input));
      } catch (e) {
        if (isRedirect(e)) return { ok: false, message: "", redirected: true };
        return { ok: false, message: t("generic") };
      }
      if (!result.ok) return { ok: false, message: result.message, error: result.error };
      if (success) toast.success(success);
      if (options?.refresh !== false) startTransition(() => router.refresh());
      return result;
    },
    [locale, t, router],
  );
}
