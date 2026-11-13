"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorText } from "@/lib/auth-error";
import { savePendingEmail } from "@/lib/pending-email";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { FormError } from "./form-parts";

export function ForgotPasswordForm({ emailEnabled }: { emailEnabled: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const errorMap = useZodErrorMap();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<{ email: string }>({
    resolver: zodResolver(forgotPasswordSchema, { error: errorMap }),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: { email: string }) {
    setFormError(null);
    const email = values.email.trim().toLowerCase();
    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
      if (error) {
        setFormError(authErrorText(error, (k) => t(`errors.${k}`)));
        return;
      }
      // Same answer whether or not the address exists (no account enumeration).
      savePendingEmail(email);
      toast.success(t("forgotPassword.sent"));
      router.push("/reset-password");
    } catch {
      setFormError(t("errors.network"));
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
      </FieldGroup>
      <FormError message={formError} />
      <Button type="submit" size="lg" disabled={submitting || !emailEnabled} className="w-full">
        {submitting && <Spinner />}
        {submitting ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
      </Button>
      <p className="text-center text-sm">
        <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
          {t("forgotPassword.backToSignIn")}
        </Link>
      </p>
    </form>
  );
}
