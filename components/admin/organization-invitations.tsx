"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CopyIcon, MailIcon, SendIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { OrgRoleBadge, ToneBadge } from "@/components/admin/badges";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { errorOf, useAdminAction } from "@/components/admin/use-admin-action";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { defaultInviteRole } from "@/lib/admin/membership-rules";
import { cancelInvitationAction, inviteMemberAction } from "@/lib/admin/organization-actions";
import { EMAIL_MAX, inviteFormSchema, type InviteFormValues } from "@/lib/admin/schemas";
import { ORG_ROLES, type OrgRole } from "@/lib/permissions";
import { useZodErrorMap } from "@/lib/use-zod-error-map";

export type InvitationView = {
  id: string;
  email: string;
  role: OrgRole | null;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  inviterName: string | null;
  inviterIsMember: boolean;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The invitation page link (the e-mail carries the same one, in the recipient's language). */
function inviteUrl(locale: string, id: string): string {
  return `${window.location.origin}/${locale}/invite/${encodeURIComponent(id)}`;
}

function CopyInviteLink({ invitation }: { invitation: InvitationView }) {
  const t = useTranslations("admin.org.invitations");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState<string | null>(null);

  async function copy() {
    const url = inviteUrl(locale, invitation.id);
    if (await copyText(url)) {
      setCopied(true);
      toast.success(t("copied"));
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setManual(url);
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" size="sm" onClick={copy} aria-label={t("copyAria", { email: invitation.email })}>
        {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
        {t("copy")}
      </Button>
      {manual && (
        <Field>
          <FieldLabel htmlFor={`invite-link-${invitation.id}`} className="sr-only">
            {t("linkLabel", { email: invitation.email })}
          </FieldLabel>
          <Input
            id={`invite-link-${invitation.id}`}
            readOnly
            value={manual}
            dir="ltr"
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
        </Field>
      )}
    </div>
  );
}

/** Pending invitations (copy link, cancel) and, for a member admin, the invite form. */
export function OrganizationInvitations({
  organizationId,
  invitations,
  canInvite,
  isOwner,
  ownerInPlace,
}: {
  organizationId: string;
  invitations: InvitationView[];
  /** The platform admin is an owner or admin of this institution (Better Auth records them as the inviter). */
  canInvite: boolean;
  isOwner: boolean;
  /** Another person owns the institution, or an owner invitation is pending (lib/admin/membership-rules ownerInPlace). */
  ownerInPlace: boolean;
}) {
  const t = useTranslations("admin.org.invitations");
  const format = useFormatter();
  const run = useAdminAction();
  const [cancelling, setCancelling] = useState<InvitationView | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {invitations.map((inv) => {
            const usable = !inv.expired && inv.inviterIsMember;
            return (
              <li key={inv.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <MailIcon aria-hidden className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">
                      <bdi dir="ltr">{inv.email}</bdi>
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      <OrgRoleBadge role={inv.role} />
                      {inv.expired && <ToneBadge kind="neutral">{t("expired")}</ToneBadge>}
                      {!inv.expired && !inv.inviterIsMember && <ToneBadge kind="warning">{t("noLongerValid")}</ToneBadge>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {inv.inviterName && <>{t("invitedBy", { name: inv.inviterName })} · </>}
                      {t("sent", { date: format.dateTime(new Date(inv.createdAt), "dateShort") })}
                      {!inv.expired && <> · {t("expires", { date: format.dateTime(new Date(inv.expiresAt), "dateShort") })}</>}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2 sm:shrink-0">
                  {usable && <CopyInviteLink invitation={inv} />}
                  <Button variant="ghost" size="sm" aria-label={t("cancelAria", { email: inv.email })} onClick={() => setCancelling(inv)}>
                    <XIcon aria-hidden />
                    {t("cancel")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canInvite ? (
        <InviteForm organizationId={organizationId} isOwner={isOwner} ownerInPlace={ownerInPlace} />
      ) : (
        <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{t("joinFirst")}</p>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(v) => !v && setCancelling(null)}
        title={t("cancelTitle", { email: cancelling?.email ?? "" })}
        description={t("cancelDescription")}
        confirmLabel={t("cancel")}
        destructive
        onConfirm={async () =>
          cancelling ? errorOf(await run(cancelInvitationAction, { organizationId, invitationId: cancelling.id }, t("canceled"))) : null
        }
      />
    </div>
  );
}

function InviteForm({ organizationId, isOwner, ownerInPlace }: { organizationId: string; isOwner: boolean; ownerInPlace: boolean }) {
  const t = useTranslations("admin.org.invitations");
  const roles = useTranslations("common.roles");
  const errorMap = useZodErrorMap();
  const run = useAdminAction();
  const [formError, setFormError] = useState<string | null>(null);
  // Only an owner may invite an owner (Better Auth rule).
  const allowed = ORG_ROLES.filter((r) => r !== "owner" || isOwner);
  const roleItems = Object.fromEntries(allowed.map((r) => [r, roles(r)]));
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema, { error: errorMap }),
    // "Owner" only while the institution still needs its first owner; else the weakest role (least privilege).
    defaultValues: { email: "", role: defaultInviteRole({ viewerIsOwner: isOwner, ownerInPlace }) },
  });
  const role = useWatch({ control: form.control, name: "role" });
  // Another owner where one is already in place gets full control: say so before the invitation goes out.
  const ownerWarning = role === "owner" && ownerInPlace;

  async function submit(values: InviteFormValues) {
    setFormError(null);
    const result = await run(inviteMemberAction, { organizationId, ...values }, t("sentToast"));
    const error = errorOf(result);
    if (error) setFormError(error);
    // After an owner invitation the institution has its owner on the way: the next one starts with the weakest role.
    else if (result.ok) form.reset({ email: "", role: values.role === "owner" ? "trainee" : values.role });
  }

  const submitting = form.formState.isSubmitting;
  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-3 rounded-lg border p-3" aria-labelledby="invite-title">
      <h3 id="invite-title" className="text-sm font-medium">
        {t("inviteTitle")}
      </h3>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="min-w-0 flex-1">
              <FieldLabel htmlFor="invite-email">{t("email")}</FieldLabel>
              <Input
                id="invite-email"
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
        <Controller
          name="role"
          control={form.control}
          render={({ field }) => (
            <Field className="sm:w-48">
              <FieldLabel htmlFor="invite-role">{t("role")}</FieldLabel>
              <Select items={roleItems} value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                <SelectTrigger
                  id="invite-role"
                  className="w-full"
                  onBlur={field.onBlur}
                  aria-describedby={ownerWarning ? "invite-owner-warning" : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roles(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      </div>
      {ownerWarning && (
        <p
          id="invite-owner-warning"
          className="flex items-start gap-2 rounded-md bg-warning/15 p-2.5 text-xs text-foreground ring-1 ring-warning/30"
        >
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[color-mix(in_oklab,var(--warning),var(--foreground)_50%)] dark:text-warning" />
          {t("ownerExists")}
        </p>
      )}
      <FormError message={formError} />
      <Button type="submit" disabled={submitting} className="self-end">
        {submitting ? <Spinner /> : <SendIcon aria-hidden className="rtl:-scale-x-100" />}
        {submitting ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
