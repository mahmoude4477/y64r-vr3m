"use client";

import { CircleAlertIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { safeCallbackUrl, withLocale } from "@/lib/safe-callback";

/** Password field with a show/hide toggle (accessible label, keeps focus in the input). */
export function PasswordInput({
  invalid,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { invalid?: boolean }) {
  const t = useTranslations("auth.fields");
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput type={visible ? "text" : "password"} aria-invalid={invalid} dir="ltr" {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** Form-level error (server/auth error), announced to screen readers. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlertIcon aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

const noopSubscribe = () => () => {};

/** window.location.search without useSearchParams (no Suspense needed; "" during SSR). */
export function useLocationSearch(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.search,
    () => "",
  );
}

/**
 * Safe post-auth destination from ?callbackUrl= (crosscheck D12/C6), default /<locale>/dashboard. The
 * callback is moved to the current page locale: a user who signs in on /en lands on English pages.
 */
export function readCallbackUrl(locale: string): string {
  const candidate = new URLSearchParams(window.location.search).get("callbackUrl");
  return withLocale(safeCallbackUrl(candidate, window.location.origin, `/${locale}/dashboard`), locale);
}

/** "?callbackUrl=..." to carry between sign-in / sign-up / verify pages, or "". */
export function callbackQuery(search: string): string {
  const cb = new URLSearchParams(search).get("callbackUrl");
  return cb ? `?${new URLSearchParams({ callbackUrl: cb }).toString()}` : "";
}
