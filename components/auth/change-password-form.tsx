"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-error";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { changePasswordSchema } from "@/lib/validation/auth";
import { FormError, PasswordInput } from "./form-parts";

type Values = { currentPassword: string; newPassword: string; confirmPassword: string };

/**
 * Change password (also the forced "set a new password" step for mustChangePassword users).
 * Better Auth hooks in lib/auth.ts clear user.mustChangePassword after a successful change.
 */
export function ChangePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const errorMap = useZodErrorMap();
  const [formError, setFormError] = useState<string | null>(null);
  const [revokeOthers, setRevokeOthers] = useState(true);
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordSchema, { error: errorMap }),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: revokeOthers,
      });
      if (error) {
        setFormError(authErrorText(error, (k) => t(`errors.${k}`)));
        return;
      }
      toast.success(t("changePassword.success"));
      window.location.assign(redirectTo ?? `/${locale}/dashboard`);
    } catch {
      setFormError(t("errors.network"));
    }
  }

  const submitting = form.formState.isSubmitting;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Controller
          name="currentPassword"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="currentPassword">{t("fields.currentPassword")}</FieldLabel>
              <PasswordInput id="currentPassword" autoComplete="current-password" invalid={fieldState.invalid} {...field} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="newPassword"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="newPassword">{t("fields.newPassword")}</FieldLabel>
              <PasswordInput id="newPassword" autoComplete="new-password" invalid={fieldState.invalid} {...field} />
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
        <Field orientation="horizontal">
          <Checkbox id="revokeOthers" checked={revokeOthers} onCheckedChange={(v) => setRevokeOthers(v === true)} />
          <FieldLabel htmlFor="revokeOthers" className="font-normal">
            {t("changePassword.revokeOthers")}
          </FieldLabel>
        </Field>
      </FieldGroup>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting && <Spinner />}
        {submitting ? t("changePassword.submitting") : t("changePassword.submit")}
      </Button>
    </form>
  );
}
