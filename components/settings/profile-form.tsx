"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheckIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/auth/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { nameTextProps } from "@/components/org/name-text";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { updateProfile } from "@/lib/settings-feature/actions";
import { NAME_MAX, PROFESSION_MAX, profileSchema, type ProfileValues } from "@/lib/settings-feature/schemas";
import { useZodErrorMap } from "@/lib/use-zod-error-map";

/**
 * Name and profession (Server Action updateProfile -> Better Auth update-user). The e-mail address is shown read-only.
 * Client errors focus the first invalid field (react-hook-form); server field errors are set on their fields and
 * focused too. The submit button is never `disabled`, so focus stays on it while saving (aria-disabled instead).
 */
export function ProfileForm({
  name,
  profession,
  email,
  emailVerified,
  children,
}: {
  name: string;
  profession: string | null;
  email: string;
  emailVerified: boolean;
  /** The summary above the fields (avatar, name, badges), rendered on the server. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("settings");
  const fields = useTranslations("auth.fields");
  const locale = useLocale();
  const errorMap = useZodErrorMap();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema, { error: errorMap }),
    defaultValues: { name, profession: profession ?? "" },
  });
  const submitting = form.formState.isSubmitting;

  async function onSubmit(values: ProfileValues) {
    setFormError(null);
    let result: Awaited<ReturnType<typeof updateProfile>>;
    try {
      result = await updateProfile(locale, values);
    } catch {
      setFormError(t("errors.network"));
      return;
    }
    if (!result.ok) {
      const fieldErrors = result.fieldErrors ?? {};
      const invalid = (["name", "profession"] as const).filter((key) => fieldErrors[key]?.length);
      invalid.forEach((key, i) => form.setError(key, { message: fieldErrors[key]?.[0] }, { shouldFocus: i === 0 }));
      if (invalid.length === 0) setFormError(result.message);
      return;
    }
    form.reset({ name: values.name.trim(), profession: values.profession.trim() });
    toast.success(t("profile.saved"));
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={submitting} className="flex flex-col gap-4">
      <CardContent className="flex flex-col gap-6">
        {children}
        <FieldGroup>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="settings-name">{fields("name")}</FieldLabel>
                <Input
                  id="settings-name"
                  dir="auto"
                  {...nameTextProps(field.value)}
                  autoComplete="name"
                  maxLength={NAME_MAX}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.invalid ? "settings-name-error" : undefined}
                  {...field}
                />
                {fieldState.invalid && <FieldError id="settings-name-error" errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="profession"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="settings-profession">
                  {fields("profession")}
                  <span className="font-normal text-muted-foreground">({fields("professionOptional")})</span>
                </FieldLabel>
                <Input
                  id="settings-profession"
                  dir="auto"
                  autoComplete="organization-title"
                  placeholder={fields("professionPlaceholder")}
                  maxLength={PROFESSION_MAX}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.invalid ? "settings-profession-error" : undefined}
                  {...field}
                />
                {fieldState.invalid && <FieldError id="settings-profession-error" errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Field>
            <div className="flex flex-wrap items-center gap-2">
              <FieldLabel htmlFor="settings-email">{fields("email")}</FieldLabel>
              {emailVerified && (
                <Badge variant="secondary">
                  <BadgeCheckIcon aria-hidden />
                  {t("profile.verified")}
                </Badge>
              )}
            </div>
            <Input id="settings-email" type="email" dir="ltr" value={email} readOnly aria-describedby="settings-email-hint" className="bg-muted/50" />
            <FieldDescription id="settings-email-hint">{t("profile.emailHint")}</FieldDescription>
          </Field>
        </FieldGroup>
        <FormError message={formError} />
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          type="submit"
          aria-disabled={submitting}
          onClick={(e) => {
            if (submitting) e.preventDefault();
          }}
          className="w-full sm:w-auto"
        >
          {submitting && <Spinner />}
          {submitting ? t("profile.saving") : t("profile.submit")}
        </Button>
      </CardFooter>
    </form>
  );
}
