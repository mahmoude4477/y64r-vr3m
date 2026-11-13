"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-error";
import { savePendingEmail } from "@/lib/pending-email";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { type SignUpValues, signUpSchema } from "@/lib/validation/auth";
import { callbackQuery, FormError, PasswordInput, readCallbackUrl, useLocationSearch } from "./form-parts";

export function SignUpForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const search = useLocationSearch();
  const errorMap = useZodErrorMap();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema, { error: errorMap }),
    defaultValues: { name: "", email: "", password: "", profession: "" },
  });

  async function onSubmit(values: SignUpValues) {
    setFormError(null);
    const email = values.email.trim().toLowerCase();
    try {
      const { data, error } = await authClient.signUp.email({
        name: values.name.trim(),
        email,
        password: values.password,
        locale,
        profession: values.profession.trim() || undefined,
      });
      if (error) {
        setFormError(authErrorText(error, (k) => t(`errors.${k}`)));
        return;
      }
      if (data?.token) {
        // Email off (lib/auth.ts EMAIL_VERIFICATION_REQUIRED): signed in already. Full navigation for the new cookie.
        window.location.assign(readCallbackUrl(locale));
        return;
      }
      // requireEmailVerification: no session yet; the 6-digit code was sent on sign-up.
      savePendingEmail(email);
      router.push(`/verify-email${callbackQuery(window.location.search)}`);
    } catch {
      setFormError(t("errors.network"));
    }
  }

  const submitting = form.formState.isSubmitting;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="name">{t("fields.name")}</FieldLabel>
              <Input id="name" autoComplete="name" aria-invalid={fieldState.invalid} {...field} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
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
              <FieldLabel htmlFor="password">{t("fields.password")}</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                aria-describedby="password-hint"
                invalid={fieldState.invalid}
                {...field}
              />
              <FieldDescription id="password-hint">{t("fields.passwordHint")}</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="profession"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="profession">
                {t("fields.profession")}
                <span className="font-normal text-muted-foreground">({t("fields.professionOptional")})</span>
              </FieldLabel>
              <Input
                id="profession"
                autoComplete="organization-title"
                placeholder={t("fields.professionPlaceholder")}
                aria-invalid={fieldState.invalid}
                {...field}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting && <Spinner />}
        {submitting ? t("signUp.submitting") : t("signUp.submit")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t("signUp.haveAccount")}{" "}
        <Link href={`/sign-in${callbackQuery(search)}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {t("signUp.signInLink")}
        </Link>
      </p>
    </form>
  );
}
