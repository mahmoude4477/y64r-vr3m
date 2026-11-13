"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { ORGANIZATION_TYPES, type OrganizationType } from "@/lib/permissions";
import { ORG_NAME_MAX, orgProfileSchema, type OrgProfileValues } from "@/lib/org/schemas";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { DIALOG_CONTENT, STICKY_FOOTER, TAP_SM } from "./dialog-styles";
import { callAuth, useOrgErrorText } from "./use-org-error";

export type OrgProfile = { name: string; nameEn: string | null; type: OrganizationType | null };

/**
 * Edit the institution's names and type (managers). Better Auth's /organization/update checks
 * organization:update (owner, admin) and lib/auth.ts audits it and refuses it while the institution is suspended;
 * the same rules as this form (orgProfileSchema) are checked on the server by lib/org/auth-gates.ts.
 */
export function EditOrgDialog({
  organizationId,
  profile,
  triggerLabel,
  triggerVariant = "outline",
}: {
  organizationId: string;
  profile: OrgProfile;
  triggerLabel: string;
  triggerVariant?: "outline" | "default" | "secondary";
}) {
  const t = useTranslations("org.profile");
  const types = useTranslations("common.orgType");
  const actions = useTranslations("common.actions");
  const errorText = useOrgErrorText();
  const errorMap = useZodErrorMap();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const defaults: OrgProfileValues = { name: profile.name, nameEn: profile.nameEn ?? "", type: profile.type ?? ("" as OrganizationType) };
  const form = useForm<OrgProfileValues>({ resolver: zodResolver(orgProfileSchema, { error: errorMap }), defaultValues: defaults });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset(defaults);
      setFormError(null);
    }
  }

  async function onSubmit(values: OrgProfileValues) {
    setFormError(null);
    const data = { name: values.name.trim(), nameEn: values.nameEn.trim(), type: values.type };
    // nameEn and type are additionalFields of the organization schema (lib/auth.ts); the client plugin is not told
    // about them, so the body goes through $fetch with the same endpoint, checks and audit.
    const result = await callAuth(() => authClient.$fetch<unknown>("/organization/update", { method: "POST", body: { organizationId, data } }));
    if (!result.ok) {
      setFormError(errorText(result.error));
      return;
    }
    toast.success(t("saved"));
    setOpen(false);
    router.refresh();
  }

  const submitting = form.formState.isSubmitting;
  const typeItems = Object.fromEntries(ORGANIZATION_TYPES.map((v) => [v, types(v)]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant={triggerVariant} size="sm" className={TAP_SM} />}>
        <PencilIcon aria-hidden />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className={DIALOG_CONTENT}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form id="org-profile-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="org-name">{t("name")}</FieldLabel>
                  <Input
                    id="org-name"
                    dir="rtl"
                    lang="ar"
                    maxLength={ORG_NAME_MAX}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? "org-name-error" : undefined}
                    {...field}
                  />
                  {fieldState.invalid && <FieldError id="org-name-error" errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="nameEn"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="org-name-en">{t("nameEn")}</FieldLabel>
                  <Input
                    id="org-name-en"
                    dir="ltr"
                    lang="en"
                    maxLength={ORG_NAME_MAX}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? "org-name-en-hint org-name-en-error" : "org-name-en-hint"}
                    {...field}
                  />
                  <FieldDescription id="org-name-en-hint">{t("nameEnHint")}</FieldDescription>
                  {fieldState.invalid && <FieldError id="org-name-en-error" errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="type"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="org-type">{t("type")}</FieldLabel>
                  <Select
                    items={typeItems}
                    value={field.value || null}
                    onValueChange={(v) => field.onChange((v as string | null) ?? "")}
                  >
                    <SelectTrigger
                      id="org-type"
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                      aria-describedby={fieldState.invalid ? "org-type-error" : undefined}
                      onBlur={field.onBlur}
                    >
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
                  {fieldState.invalid && <FieldError id="org-type-error" errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
          <FormError message={formError} />
        </form>
        <DialogFooter className={STICKY_FOOTER}>
          <DialogClose render={<Button variant="outline" />}>{actions("cancel")}</DialogClose>
          <Button type="submit" form="org-profile-form" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? t("saving") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
