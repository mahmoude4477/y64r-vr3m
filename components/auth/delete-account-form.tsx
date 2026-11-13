"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon, MailCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { AccountDeletionInfo } from "@/lib/account/deletion";
import { confirmAccountDeletion, type DeletionFailure, requestAccountDeletion } from "@/lib/account/delete-account";
import { confirmDeletionSchema } from "@/lib/account/schemas";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { FormError, PasswordInput } from "./form-parts";
import { OtpField } from "./otp-field";

/** Errors after which the current code is gone: the form goes back to "send a code". */
const CODE_GONE = new Set<DeletionFailure["error"]>(["expired", "too_many_tries"]);

/**
 * A busy button stays focusable (aria-disabled, Base UI blocks the click) instead of `disabled`: a disabled button
 * that has focus drops it to <body>, and the keyboard or screen-reader user loses their place (WCAG 2.4.3).
 */
const BUSY_BUTTON = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

type Values = { code: string; password?: string };

/** Next's redirect error (digest "NEXT_REDIRECT;…"): the router is already navigating, nothing to show. */
const isRedirect = (e: unknown) =>
  typeof e === "object" && e !== null && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");

/**
 * "Delete my account" (PRODUCT 9): 1) e-mail a 6-digit code, 2) code + password (when the account has one) + an
 * explicit "I understand" tick -> the account is deleted and the browser goes to /<locale>/account-deleted.
 * All rules live on the server (lib/account/delete-account.ts); `info` comes from getAccountDeletionInfo().
 */
export function DeleteAccountForm({ info }: { info: AccountDeletionInfo }) {
  const t = useTranslations("auth.deleteAccount");
  const tf = useTranslations("auth.fields");
  const tAuth = useTranslations("auth.errors");
  const locale = useLocale();
  const errorMap = useZodErrorMap();
  const [step, setStep] = useState<"start" | "code">("start");
  // Each step replaces the button the user just pressed, so focus moves on with it (WCAG 2.4.3): to the code input
  // after a send, and back to the send button when an expired or used-up code returns the form to the start.
  const [returned, setReturned] = useState(false);
  // "Send a new code" succeeded: a line in the code-sent status region, removed when the next send starts, so every
  // successful resend changes the live region and is announced.
  const [resent, setResent] = useState(false);
  const [minutes, setMinutes] = useState(info.codeMinutes);
  const [understood, setUnderstood] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  // The same schema as the server action; the password is required only when the account has one.
  const schema = useMemo(
    () => (info.hasPassword ? confirmDeletionSchema.extend({ password: z.string().min(1).max(128) }) : confirmDeletionSchema),
    [info.hasPassword],
  );
  const form = useForm<Values>({ resolver: zodResolver(schema, { error: errorMap }), defaultValues: { code: "", password: "" } });
  const code = useWatch({ control: form.control, name: "code" });
  const deleting = form.formState.isSubmitting;

  if (info.impersonating || info.blockers.length > 0 || !info.emailEnabled) {
    const messages = info.impersonating
      ? [t("errors.impersonating")]
      : info.blockers.length > 0
        ? info.blockers.map((b) => b.message)
        : [t("errors.emailOff")];
    return (
      <Alert variant={info.emailEnabled ? "destructive" : "default"} role="alert">
        {info.emailEnabled ? <CircleAlertIcon aria-hidden /> : <TriangleAlertIcon aria-hidden />}
        <AlertDescription>
          {messages.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </AlertDescription>
      </Alert>
    );
  }

  function sendCode() {
    const resend = step === "code";
    setFormError(null);
    setResent(false);
    form.clearErrors();
    startSending(async () => {
      try {
        const r = await requestAccountDeletion(locale);
        if (!r.ok) {
          setFormError(r.message); // focus stays on the (still focusable) button
          return;
        }
        setMinutes(r.minutes);
        form.resetField("code");
        setStep("code");
        if (resend) {
          setResent(true);
          form.setFocus("code"); // the first send focuses it through autoFocus (the input appears)
        }
      } catch {
        setFormError(tAuth("network"));
      }
    });
  }

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      // Success never returns: the action redirects to /<locale>/account-deleted on the server.
      const r = await confirmAccountDeletion(locale, { code: values.code, password: info.hasPassword ? values.password : undefined });
      if (!r) return;
      const fieldErrors = (Object.entries(r.fieldErrors ?? {}) as Array<[keyof Values, string[] | undefined]>).flatMap(
        ([name, messages]) => (messages?.[0] ? [{ name, message: messages[0] }] : []),
      );
      // Focus goes to the field to fix (the first one with an error), else it stays on the submit button.
      fieldErrors.forEach(({ name, message }, i) => form.setError(name, { message }, { shouldFocus: i === 0 }));
      if (fieldErrors.length === 0) setFormError(r.message);
      if (CODE_GONE.has(r.error)) {
        setReturned(true);
        setStep("start");
      }
      if (r.error === "invalid_code") {
        form.resetField("code");
        form.setFocus("code");
      }
      if (r.error === "invalid_password" && info.hasPassword) form.setFocus("password", { shouldSelect: true });
    } catch (e) {
      // The redirect after a successful delete reaches the caller as a rejected promise while Next navigates.
      if (isRedirect(e)) return;
      setFormError(tAuth("network"));
    }
  }

  if (step === "start") {
    return (
      <div className="flex flex-col gap-4">
        <FormError message={formError} />
        <Button type="button" variant="destructive" onClick={sendCode} disabled={sending} autoFocus={returned}>
          {sending && <Spinner />}
          {sending ? t("sending") : t("sendCode")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <Alert role="status">
        <MailCheckIcon aria-hidden />
        <AlertDescription>
          {resent && <p className="font-medium text-foreground">{t("codeResent")}</p>}
          {t.rich("codeSent", {
            email: info.email,
            minutes,
            addr: (chunks) => (
              <bdi dir="ltr" className="font-medium text-foreground">
                {chunks}
              </bdi>
            ),
          })}
        </AlertDescription>
      </Alert>
      <FieldGroup>
        <Controller
          name="code"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="delete-code">{t("codeLabel")}</FieldLabel>
              <OtpField
                id="delete-code"
                label={t("codeLabel")}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                invalid={fieldState.invalid}
                autoFocus
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {info.hasPassword && (
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="delete-password">{tf("password")}</FieldLabel>
                <PasswordInput
                  id="delete-password"
                  autoComplete="current-password"
                  invalid={fieldState.invalid}
                  {...field}
                  value={field.value ?? ""}
                />
                <FieldDescription>{t("passwordHint")}</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}
        <Field orientation="horizontal">
          <Checkbox id="delete-understood" checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} />
          <FieldLabel htmlFor="delete-understood" className="font-normal">
            {t("understand")}
          </FieldLabel>
        </Field>
      </FieldGroup>
      <FormError message={formError} />
      <Button
        type="submit"
        variant="destructive"
        size="lg"
        disabled={deleting || !understood || code.length !== 6}
        focusableWhenDisabled
        className={`w-full ${BUSY_BUTTON}`}
      >
        {deleting && <Spinner />}
        {deleting ? t("deleting") : t("confirm")}
      </Button>
      <Button type="button" variant="ghost" onClick={sendCode} disabled={sending || deleting} focusableWhenDisabled className={BUSY_BUTTON}>
        {sending && <Spinner />}
        {t("resend")}
      </Button>
    </form>
  );
}
