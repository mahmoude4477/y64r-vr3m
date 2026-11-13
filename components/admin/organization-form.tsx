"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm, type Control, type FieldValues, type Path } from "react-hook-form";
import { toast } from "sonner";
import { errorOf, useAdminAction } from "@/components/admin/use-admin-action";
import { FormError } from "@/components/auth/form-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { createOrganizationAction } from "@/lib/admin/organization-actions";
import { createOrganizationSchema, type CreateOrganizationValues, EMAIL_MAX, ORG_NAME_MAX } from "@/lib/admin/schemas";
import { ORGANIZATION_TYPES } from "@/lib/permissions";
import { useZodErrorMap } from "@/lib/use-zod-error-map";

type ProfileFields = { nameAr: string; nameEn: string; type: string };

/** The names (Arabic, English) and type fields, shared by "new institution" and the edit dialog. */
export function OrganizationProfileFields<T extends FieldValues & ProfileFields>({ control, idPrefix }: { control: Control<T>; idPrefix: string }) {
  const t = useTranslations("admin.createOrg");
  const types = useTranslations("common.orgType");
  const typeItems = Object.fromEntries(ORGANIZATION_TYPES.map((v) => [v, types(v)]));
  return (
    <FieldGroup>
      <Controller
        name={"nameAr" as Path<T>}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${idPrefix}-name-ar`}>{t("nameAr")}</FieldLabel>
            <Input id={`${idPrefix}-name-ar`} dir="rtl" lang="ar" maxLength={ORG_NAME_MAX} autoComplete="organization" aria-invalid={fieldState.invalid} {...field} />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name={"nameEn" as Path<T>}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${idPrefix}-name-en`}>{t("nameEn")}</FieldLabel>
            <Input id={`${idPrefix}-name-en`} dir="ltr" lang="en" maxLength={ORG_NAME_MAX} aria-invalid={fieldState.invalid} {...field} />
            <FieldDescription>{t("nameEnHint")}</FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name={"type" as Path<T>}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${idPrefix}-type`}>{t("type")}</FieldLabel>
            <Select items={typeItems} value={field.value || null} onValueChange={(v) => field.onChange((v as string | null) ?? "")}>
              <SelectTrigger id={`${idPrefix}-type`} className="w-full" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
                <SelectValue placeholder={t("typePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATION_TYPES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {types(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </FieldGroup>
  );
}

/** "New institution": Better Auth creates it (the admin becomes its first owner) and e-mails the owner's invitation. */
export function CreateOrganizationForm() {
  const t = useTranslations("admin.createOrg");
  const errorMap = useZodErrorMap();
  const router = useRouter();
  const run = useAdminAction();
  const [formError, setFormError] = useState<string | null>(null);
  // Once the institution exists the form stays locked (and shows "opening…") until its page replaces this one: a
  // second click must never create a second institution and send a second owner invitation.
  const [created, setCreated] = useState(false);
  const [, startNavigation] = useTransition();
  const form = useForm<CreateOrganizationValues>({
    resolver: zodResolver(createOrganizationSchema, { error: errorMap }),
    defaultValues: { nameAr: "", nameEn: "", type: "" as CreateOrganizationValues["type"], ownerEmail: "" },
  });

  async function submit(values: CreateOrganizationValues) {
    if (created) return;
    setFormError(null);
    const result = await run(createOrganizationAction, values, undefined, { refresh: false });
    const error = errorOf(result);
    if (error || !result.ok) {
      setFormError(error);
      return;
    }
    setCreated(true);
    if (result.inviteError) toast.warning(t("inviteFailed", { reason: result.inviteError }));
    else toast.success(result.invitationId ? t("invited") : t("created"));
    startNavigation(() => router.push(`/admin/organizations/${result.organizationId}`));
  }

  const submitting = form.formState.isSubmitting;
  const busy = submitting || created;
  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="flex max-w-2xl flex-col gap-4">
      <fieldset disabled={created} className="contents">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("detailsTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OrganizationProfileFields control={form.control} idPrefix="new-org" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("ownerTitle")}</h2>
          </CardTitle>
          <CardDescription>{t("ownerHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            name="ownerEmail"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="new-org-owner">{t("owner")}</FieldLabel>
                <Input
                  id="new-org-owner"
                  type="email"
                  dir="ltr"
                  inputMode="email"
                  autoComplete="off"
                  maxLength={EMAIL_MAX}
                  aria-invalid={fieldState.invalid}
                  {...field}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Alert>
            <InfoIcon aria-hidden />
            <AlertDescription>{t("creatorNote")}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
      </fieldset>
      <FormError message={formError} />
      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy && <Spinner />}
          {created ? t("opening") : submitting ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
