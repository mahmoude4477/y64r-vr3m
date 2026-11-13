"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CloudOffIcon, MailCheckIcon, UserPlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormError } from "@/components/auth/form-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import type { OrgRole } from "@/lib/permissions";
import { type OrgErrorKey, orgErrorKey } from "@/lib/org/errors";
import type { DepartmentRef } from "@/lib/org/queries";
import { assignableRoles } from "@/lib/org/roles";
import { inviteSchema, type InviteValues } from "@/lib/org/schemas";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { CopyLinkField } from "./copy-link";
import { DIALOG_CONTENT, STICKY_FOOTER } from "./dialog-styles";
import { RoleChoice } from "./role-choice";
import { callAuth, invitationUrl, useOrgErrorText } from "./use-org-error";

const NO_DEPARTMENT = "__none__";

/** Server answers about the address itself: shown on the e-mail field, which gets the focus (R2-UX-2). */
const EMAIL_ERRORS = new Set<OrgErrorKey>(["alreadyMember", "alreadyInvited", "invalidEmail"]);

/**
 * Invite by e-mail (managers). Better Auth's /organization/invite-member checks the role rules (only owners invite
 * owners), and lib/auth.ts sends the e-mail and writes the audit row. The copyable link is always shown afterwards:
 * it is the fallback when e-mail is off or the message does not arrive.
 */
export function InviteDialog({
  organizationId,
  actorRole,
  departments,
  emailEnabled,
  inviteDays,
  defaultOpen = false,
}: {
  organizationId: string;
  actorRole: OrgRole;
  departments: DepartmentRef[];
  emailEnabled: boolean;
  inviteDays: number;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("org.invite");
  const actions = useTranslations("common.actions");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useOrgErrorText();
  const errorMap = useZodErrorMap();
  const [open, setOpen] = useState(defaultOpen);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; link: string } | null>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const formErrorBox = useRef<HTMLDivElement>(null);
  const roles = assignableRoles(actorRole);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema, { error: errorMap }),
    defaultValues: { email: "", role: "trainee", teamId: "" },
  });

  // ?invite=1 (from the overview's first steps) opens the dialog once; drop it from the address bar.
  useEffect(() => {
    if (!defaultOpen) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("invite")) {
      url.searchParams.delete("invite");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, [defaultOpen]);

  // The success view replaces the form: move focus to its heading so screen readers announce it.
  useEffect(() => {
    if (sent) sentHeading.current?.focus();
  }, [sent]);

  // A refusal that is not about the address: focus its message. The Send button is disabled while the request runs,
  // so focus would otherwise be left on <body> inside the open dialog (WCAG 2.4.3).
  useEffect(() => {
    if (formError) formErrorBox.current?.focus();
  }, [formError]);

  function reset() {
    form.reset({ email: "", role: form.getValues("role"), teamId: form.getValues("teamId") });
    setFormError(null);
    setSent(null);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      form.reset({ email: "", role: "trainee", teamId: "" });
      setFormError(null);
      setSent(null);
    }
  }

  async function onSubmit(values: InviteValues) {
    setFormError(null);
    const email = values.email.trim().toLowerCase();
    const result = await callAuth(() =>
      authClient.organization.inviteMember({
        email,
        role: values.role,
        organizationId,
        ...(values.teamId ? { teamId: values.teamId } : {}),
      }),
    );
    if (!result.ok) {
      if (EMAIL_ERRORS.has(orgErrorKey(result.error))) {
        form.setError("email", { type: "server", message: errorText(result.error) }, { shouldFocus: true });
      } else {
        setFormError(errorText(result.error));
      }
      return;
    }
    setSent({ email, link: invitationUrl(locale, result.data.id) });
    router.refresh();
  }

  const submitting = form.formState.isSubmitting;
  const departmentItems = { [NO_DEPARTMENT]: t("departmentNone"), ...Object.fromEntries(departments.map((d) => [d.id, d.name])) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button />}>
        <UserPlusIcon aria-hidden />
        {t("button")}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className={DIALOG_CONTENT}>
        {sent ? (
          <>
            <DialogHeader>
              <div className="flex size-10 items-center justify-center rounded-full bg-success/12 text-success">
                <MailCheckIcon aria-hidden className="size-5" />
              </div>
              <DialogTitle ref={sentHeading} tabIndex={-1} className="outline-none">
                {emailEnabled ? t("sentTitle") : t("createdTitle")}
              </DialogTitle>
              <DialogDescription>
                {t.rich(emailEnabled ? "sentDescription" : "createdDescription", {
                  email: sent.email,
                  addr: (c) => (
                    <bdi dir="ltr" className="font-medium text-foreground">
                      {c}
                    </bdi>
                  ),
                })}
              </DialogDescription>
            </DialogHeader>
            <CopyLinkField id="invite-link" label={t("link")} hint={t("linkHint")} value={sent.link} />
            <DialogFooter className={STICKY_FOOTER}>
              <Button variant="outline" onClick={reset}>
                {t("another")}
              </Button>
              <DialogClose render={<Button />}>{t("done")}</DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("description", { days: inviteDays, n: String(inviteDays) })}</DialogDescription>
            </DialogHeader>
            {!emailEnabled && (
              <Alert>
                <CloudOffIcon aria-hidden />
                <AlertDescription>{t("emailOff")}</AlertDescription>
              </Alert>
            )}
            <form id="invite-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
              <FieldGroup>
                <Controller
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="invite-email">{t("email")}</FieldLabel>
                      <Input
                        id="invite-email"
                        type="email"
                        inputMode="email"
                        autoComplete="off"
                        dir="ltr"
                        aria-invalid={fieldState.invalid}
                        aria-describedby={fieldState.invalid ? "invite-email-hint invite-email-error" : "invite-email-hint"}
                        {...field}
                      />
                      <FieldDescription id="invite-email-hint">{t("emailHint")}</FieldDescription>
                      {fieldState.invalid && <FieldError id="invite-email-error" errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="role"
                  control={form.control}
                  render={({ field }) => <RoleChoice id="invite-role" legend={t("role")} roles={roles} value={field.value} onChange={field.onChange} />}
                />
                <Controller
                  name="teamId"
                  control={form.control}
                  render={({ field }) =>
                    departments.length > 0 ? (
                      <Field>
                        <FieldLabel htmlFor="invite-department">{t("department")}</FieldLabel>
                        <Select
                          items={departmentItems}
                          value={field.value || NO_DEPARTMENT}
                          onValueChange={(v) => field.onChange(!v || v === NO_DEPARTMENT ? "" : (v as string))}
                        >
                          <SelectTrigger id="invite-department" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_DEPARTMENT}>{t("departmentNone")}</SelectItem>
                            {departments.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldDescription>{t("departmentHint")}</FieldDescription>
                      </Field>
                    ) : (
                      <Field>
                        <FieldTitle>{t("department")}</FieldTitle>
                        <FieldDescription>{t("noDepartments")}</FieldDescription>
                      </Field>
                    )
                  }
                />
              </FieldGroup>
              <div ref={formErrorBox} tabIndex={-1} className="outline-none empty:hidden">
                <FormError message={formError} />
              </div>
            </form>
            <DialogFooter className={STICKY_FOOTER}>
              <DialogClose render={<Button variant="outline" />}>{actions("cancel")}</DialogClose>
              <Button type="submit" form="invite-form" disabled={submitting}>
                {submitting && <Spinner />}
                {submitting ? t("submitting") : emailEnabled ? t("submit") : t("submitOff")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
