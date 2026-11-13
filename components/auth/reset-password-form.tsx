"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-error";
import { clearPendingEmail, readPendingEmail } from "@/lib/pending-email";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { FormError, PasswordInput } from "./form-parts";
import { OtpField } from "./otp-field";

type Values = { email: string; otp: string; password: string; confirmPassword: string };
const noopSubscribe = () => () => {};

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const errorMap = useZodErrorMap();
  const pendingEmail = useSyncExternalStore(noopSubscribe, readPendingEmail, () => "");
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema, { error: errorMap }),
    defaultValues: { email: "", otp: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (pendingEmail) form.setValue("email", pendingEmail);
  }, [pendingEmail, form]);

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      const { error } = await authClient.emailOtp.resetPassword({
        email: values.email.trim().toLowerCase(),
        otp: values.otp,
        password: values.password,
      });
      if (error) {
        setFormError(authErrorText(error, (k) => t(`errors.${k}`)));
        return;
      }
      clearPendingEmail();
      toast.success(t("resetPassword.success"));
      router.push("/sign-in");
    } catch {
      setFormError(t("errors.network"));
    }
  }

  const submitting = form.formState.isSubmitting;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {pendingEmail ? (
        <Alert>
          <KeyRoundIcon aria-hidden />
          <AlertDescription>
            {t.rich("resetPassword.description", {
              email: pendingEmail,
              addr: (chunks) => (
                <bdi dir="ltr" className="font-medium text-foreground">
                  {chunks}
                </bdi>
              ),
            })}
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">{t("resetPassword.descriptionNoEmail")}</p>
      )}
      <FieldGroup>
        {!pendingEmail && (
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
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">{t("fields.newPassword")}</FieldLabel>
              <PasswordInput id="password" autoComplete="new-password" invalid={fieldState.invalid} {...field} />
              <FieldDescription>{t("fields.passwordHint")}</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="confirmPassword"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="confirmPassword">{t("fields.confirmPassword")}</FieldLabel>
              <PasswordInput id="confirmPassword" autoComplete="new-password" invalid={fieldState.invalid} {...field} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting && <Spinner />}
        {submitting ? t("resetPassword.submitting") : t("resetPassword.submit")}
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          {t("resetPassword.requestNew")}
        </Link>
      </p>
    </form>
  );
}
