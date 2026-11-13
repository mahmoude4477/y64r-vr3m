"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-error";
import { savePendingEmail } from "@/lib/pending-email";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { type SignInValues, signInSchema } from "@/lib/validation/auth";
import { callbackQuery, FormError, PasswordInput, readCallbackUrl, useLocationSearch } from "./form-parts";

export function SignInForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const search = useLocationSearch();
  const errorMap = useZodErrorMap();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema, { error: errorMap }),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInValues) {
    setFormError(null);
    try {
      const { error } = await authClient.signIn.email({
        email: values.email.trim(),
        password: values.password,
        rememberMe: true,
      });
      if (error) {
        if (error.code === "EMAIL_NOT_VERIFIED") {
          // emailVerification.sendOnSignIn already sent a fresh code
          savePendingEmail(values.email.trim().toLowerCase());
          toast.info(t("signIn.notVerified"));
          router.push(`/verify-email${callbackQuery(window.location.search)}`);
          return;
        }
        setFormError(authErrorText(error, (k) => t(`errors.${k}`)));
        return;
      }
      // Full navigation so every server component sees the new session cookie.
      window.location.assign(readCallbackUrl(locale));
    } catch {
      setFormError(t("errors.network"));
    }
  }

  const submitting = form.formState.isSubmitting;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <FieldGroup>
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
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="password">{t("fields.password")}</FieldLabel>
                <Link href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
                  {t("signIn.forgot")}
                </Link>
              </div>
              <PasswordInput id="password" autoComplete="current-password" invalid={fieldState.invalid} {...field} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting && <Spinner />}
        {submitting ? t("signIn.submitting") : t("signIn.submit")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t("signIn.noAccount")}{" "}
        <Link href={`/sign-up${callbackQuery(search)}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {t("signIn.signUpLink")}
        </Link>
      </p>
    </form>
  );
}
