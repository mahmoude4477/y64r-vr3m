"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-error";
import { clearPendingEmail, readPendingEmail, savePendingEmail } from "@/lib/pending-email";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { verifyEmailSchema } from "@/lib/validation/auth";
import { FormError, readCallbackUrl } from "./form-parts";
import { OtpField } from "./otp-field";

const RESEND_COOLDOWN_SECONDS = 60;
type Values = { email: string; otp: string };

const noopSubscribe = () => () => {};

/** Remaining cooldown seconds, ticking once per second while > 0. */
export function useCooldown(initialSeconds: number) {
  const [until, setUntil] = useState(() => (initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : 0));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until, now]);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  return {
    remaining,
    start: (seconds: number) => {
      const t = Date.now();
      setNow(t);
      setUntil(t + seconds * 1000);
    },
  };
}

export function VerifyEmailForm({ emailEnabled }: { emailEnabled: boolean }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const errorMap = useZodErrorMap();
  const pendingEmail = useSyncExternalStore(noopSubscribe, readPendingEmail, () => "");
  const [editEmail, setEditEmail] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS);
  const form = useForm<Values>({
    resolver: zodResolver(verifyEmailSchema, { error: errorMap }),
    defaultValues: { email: "", otp: "" },
  });

  const knownEmail = !editEmail && pendingEmail ? pendingEmail : "";
  useEffect(() => {
    if (knownEmail) form.setValue("email", knownEmail);
  }, [knownEmail, form]);

  async function onSubmit(values: Values) {
    setFormError(null);
    const email = values.email.trim().toLowerCase();
    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email, otp: values.otp });
      if (error) {
        setFormError(authErrorText(error, (k) => t(`errors.${k}`)));
        form.setValue("otp", "");
        return;
      }
      clearPendingEmail();
      toast.success(t("verifyEmail.success"));
      // autoSignInAfterVerification set the session cookie
      window.location.assign(readCallbackUrl(locale));
    } catch {
      setFormError(t("errors.network"));
    }
  }

  async function resend() {
    const email = (form.getValues("email") || knownEmail).trim().toLowerCase();
    const valid = await form.trigger("email");
    if (!valid || !email) return;
    setResending(true);
    setFormError(null);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
      if (error) {
        setFormError(authErrorText(error, (k) => t(`errors.${k}`)));
        return;
      }
      savePendingEmail(email);
      cooldown.start(RESEND_COOLDOWN_SECONDS);
      toast.success(t("verifyEmail.resent"));
    } catch {
      setFormError(t("errors.network"));
    } finally {
      setResending(false);
    }
  }

  const submitting = form.formState.isSubmitting;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {!emailEnabled && (
        <Alert>
          <TriangleAlertIcon aria-hidden />
          <AlertDescription>{t("errors.emailOff")}</AlertDescription>
        </Alert>
      )}
      {knownEmail ? (
        <Alert>
          <MailCheckIcon aria-hidden />
          <AlertDescription>
            <span>
              {t.rich("verifyEmail.description", {
                email: knownEmail,
                addr: (chunks) => (
                  <bdi dir="ltr" className="font-medium text-foreground">
                    {chunks}
                  </bdi>
                ),
              })}
            </span>
            <button
              type="button"
              className="mt-1 w-fit text-sm text-primary underline-offset-4 hover:underline"
              onClick={() => setEditEmail(true)}
            >
              {t("verifyEmail.changeEmail")}
            </button>
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">{t("verifyEmail.descriptionNoEmail")}</p>
      )}
      <FieldGroup>
        {!knownEmail && (
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="email">{t("fields.email")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  dir="ltr"
                  aria-invalid={fieldState.invalid}
                  {...field}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        )}
        <Controller
          name="otp"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="otp">{t("fields.code")}</FieldLabel>
              <OtpField
                id="otp"
                label={t("fields.code")}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting && <Spinner />}
        {submitting ? t("verifyEmail.submitting") : t("verifyEmail.submit")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={resending || cooldown.remaining > 0 || !emailEnabled}
        onClick={resend}
        aria-live="polite"
      >
        {resending && <Spinner />}
        {cooldown.remaining > 0
          ? t("verifyEmail.resendIn", { seconds: String(cooldown.remaining) })
          : t("verifyEmail.resend")}
      </Button>
    </form>
  );
}
