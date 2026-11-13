"use client";

import { LanguagesIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { switchLocaleHref } from "@/lib/safe-callback";

/** How long a signed-in switch waits for user.locale to be saved before navigating anyway. */
const PERSIST_TIMEOUT_MS = 1500;

/**
 * Switches ar <-> en and keeps the path, query and hash (a callbackUrl moves to the new locale too). When
 * `persist` is set (signed-in shell), the choice is also saved to user.locale so emails and auth errors
 * follow it.
 *
 * A FULL document navigation on purpose: the [locale] root layout (html lang/dir, fonts, theme script)
 * changes anyway, and a client-side transition would re-render next-themes' inline <script> on the client
 * (React logs "Encountered a script tag ...") and keep the old-locale page hidden in the DOM.
 */
export function LocaleSwitcher({ persist = false, compact = false }: { persist?: boolean; compact?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("common.localeSwitcher");
  const [pending, setPending] = useState(false);
  const next = locale === "ar" ? "en" : "ar";

  async function switchLocale() {
    setPending(true);
    // Read the URL in the handler (no usePathname/useSearchParams): works on dynamic routes without a
    // Suspense boundary under cacheComponents.
    const href = switchLocaleHref(window.location, next);
    if (persist) {
      const save = authClient.updateUser({ locale: next }).catch(() => undefined);
      await Promise.race([save, new Promise((resolve) => setTimeout(resolve, PERSIST_TIMEOUT_MS))]);
    }
    window.location.assign(href);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon-sm" : "sm"}
      lang={next}
      disabled={pending}
      aria-label={t("label")}
      title={t("label")}
      onClick={() => void switchLocale()}
    >
      <LanguagesIcon aria-hidden />
      {!compact && <span>{t("switchTo")}</span>}
    </Button>
  );
}
