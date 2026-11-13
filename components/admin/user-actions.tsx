"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  BanIcon,
  LogOutIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  ShieldQuestionIcon,
  SquarePenIcon,
  Trash2Icon,
  UndoIcon,
  VenetianMaskIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { startTransition, useId, useState } from "react";
import { toast } from "sonner";
import { Controller, useForm } from "react-hook-form";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { errorOf, useAdminAction } from "@/components/admin/use-admin-action";
import { FormError } from "@/components/auth/form-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { adminErrorKeyForCode } from "@/lib/admin/errors";
import {
  BAN_DURATIONS,
  BAN_REASON_MAX,
  banFormSchema,
  type BanFormValues,
} from "@/lib/admin/schemas";
import { removeMemberAction } from "@/lib/admin/organization-actions";
import {
  banUserAction,
  removeUserAction,
  revokeUserSessionsAction,
  setUserRoleAction,
  unbanUserAction,
} from "@/lib/admin/user-actions";
import { authClient } from "@/lib/auth-client";
import { useZodErrorMap } from "@/lib/use-zod-error-map";

export type UserActionsTarget = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  /** user.role "protocol_editor" (and not a platform admin). */
  isProtocolEditor: boolean;
  bannedNow: boolean;
  self: boolean;
  /** Names of institutions where this user is the only owner while other members remain (deletion blocker). */
  soleOwnerOf: string[];
  lastPlatformAdmin: boolean;
  /** Institutions where this user is an owner or admin: offered for removal when platform admin is taken away. */
  managedMemberships: Array<{
    memberId: string;
    organizationId: string;
    name: string;
    role: "owner" | "admin";
  }>;
};

type Open =
  | null
  | "role"
  | "editor"
  | "ban"
  | "unban"
  | "revoke"
  | "impersonate"
  | "delete";

/** The account actions of /admin/users/<id>. Every one goes through a Better Auth admin endpoint (audited). */
export function UserActions({ target }: { target: UserActionsTarget }) {
  const t = useTranslations("admin.user.actions");
  const errors = useTranslations("admin.errors");
  const actions = useTranslations("common.actions");
  const roles = useTranslations("common.roles");
  const locale = useLocale();
  const router = useRouter();
  const run = useAdminAction();
  const leaveId = useId();
  const [open, setOpen] = useState<Open>(null);
  const [leaveInstitutions, setLeaveInstitutions] = useState(false);
  const list = (names: string[]) =>
    new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
  const demoting = target.isAdmin;
  const managed = target.managedMemberships;

  /**
   * Platform role change. When taking platform admin away, the admin may also remove the person from the institutions
   * they own or manage (e.g. ones they created as a platform admin): org access is separate from the platform role and
   * would otherwise survive the demotion. An institution where they are the only owner keeps them (lastOwner).
   */
  async function changeRole(): Promise<string | null> {
    const leave = demoting && leaveInstitutions && managed.length > 0;
    const result = await run(
      setUserRoleAction,
      { userId: target.id, role: demoting ? "user" : "admin" },
      t("roleChanged"),
      { refresh: !leave },
    );
    if (!result.ok) return errorOf(result);
    if (leave) {
      const kept: string[] = [];
      for (const m of managed) {
        const removed = await run(
          removeMemberAction,
          { organizationId: m.organizationId, memberId: m.memberId },
          undefined,
          { refresh: false },
        );
        if (!removed.ok) kept.push(m.name);
      }
      if (kept.length > 0)
        toast.warning(t("demoteKept", { organizations: list(kept) }));
      else toast.success(t("demoteLeft"));
      startTransition(() => router.refresh());
    }
    return null;
  }
  /** Protocol editor on or off (platform admins have it already: the button is not shown for them). */
  async function changeEditor(): Promise<string | null> {
    const role = target.isProtocolEditor ? "user" : "protocol_editor";
    return errorOf(
      await run(
        setUserRoleAction,
        { userId: target.id, role },
        t("roleChanged"),
      ),
    );
  }
  const dialog = (key: Exclude<Open, null>) => ({
    open: open === key,
    onOpenChange: (v: boolean) => setOpen(v ? key : null),
  });

  const deletionBlocked =
    target.soleOwnerOf.length > 0 || target.lastPlatformAdmin;
  const impersonateBlocked = target.isAdmin
    ? t("impersonateAdmin")
    : target.bannedNow
      ? t("impersonateBanned")
      : null;
  const disabled = target.self;

  async function impersonate(): Promise<string | null> {
    const { error } = await authClient.admin.impersonateUser({
      userId: target.id,
    });
    if (error) {
      const key = adminErrorKeyForCode(error.code);
      return key ? errors(key) : error.message || errors("generic");
    }
    // A full page load: the session cookie changed, so every server component must render for the new user.
    window.location.assign(
      new URL(`/${locale}/admin/impersonation`, window.location.origin).href,
    );
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="justify-start"
        disabled={disabled}
        onClick={() => setOpen("role")}
      >
        {target.isAdmin ? (
          <ShieldOffIcon aria-hidden />
        ) : (
          <ShieldCheckIcon aria-hidden />
        )}
        {target.isAdmin ? t("removeAdmin") : t("makeAdmin")}
      </Button>
      {!target.isAdmin && (
        <Button
          variant="outline"
          className="justify-start"
          disabled={disabled}
          onClick={() => setOpen("editor")}
        >
          <SquarePenIcon aria-hidden />
          {target.isProtocolEditor ? t("removeEditor") : t("makeEditor")}
        </Button>
      )}
      {target.bannedNow ? (
        <Button
          variant="outline"
          className="justify-start"
          disabled={disabled}
          onClick={() => setOpen("unban")}
        >
          <UndoIcon aria-hidden />
          {t("unban")}
        </Button>
      ) : (
        <Button
          variant="outline"
          className="justify-start"
          disabled={disabled}
          onClick={() => setOpen("ban")}
        >
          <BanIcon aria-hidden />
          {t("ban")}
        </Button>
      )}
      <Button
        variant="outline"
        className="justify-start"
        disabled={disabled}
        onClick={() => setOpen("revoke")}
      >
        <LogOutIcon aria-hidden className="rtl:rotate-180" />
        {t("revokeAll")}
      </Button>
      <div className="flex flex-col gap-1">
        <Button
          variant="outline"
          className="justify-start"
          disabled={disabled || !!impersonateBlocked}
          aria-describedby={
            impersonateBlocked && !disabled ? "impersonate-hint" : undefined
          }
          onClick={() => setOpen("impersonate")}
        >
          <VenetianMaskIcon aria-hidden />
          {t("impersonate")}
        </Button>
        {impersonateBlocked && !disabled && (
          <p id="impersonate-hint" className="text-xs text-muted-foreground">
            {impersonateBlocked}
          </p>
        )}
      </div>
      <Button
        variant="destructive"
        className="justify-start"
        disabled={disabled}
        onClick={() => setOpen("delete")}
      >
        <Trash2Icon aria-hidden />
        {t("delete")}
      </Button>

      <ConfirmDialog
        {...dialog("role")}
        onOpenChange={(v) => {
          if (v) setLeaveInstitutions(false);
          setOpen(v ? "role" : null);
        }}
        title={
          demoting
            ? t("demoteTitle", { name: target.name })
            : t("promoteTitle", { name: target.name })
        }
        description={
          demoting
            ? managed.length > 0
              ? t("demoteDescriptionManaged")
              : t("demoteDescription")
            : t("promoteDescription")
        }
        confirmLabel={demoting ? t("removeAdmin") : t("makeAdmin")}
        destructive={demoting}
        onConfirm={changeRole}
      >
        {demoting && managed.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">{t("demoteMemberships")}</p>
            <ul className="flex flex-col gap-1">
              {managed.map((m) => (
                <li
                  key={m.memberId}
                  className="flex flex-wrap items-baseline gap-x-2"
                >
                  <bdi className="font-medium">{m.name}</bdi>
                  <span className="text-muted-foreground">{roles(m.role)}</span>
                </li>
              ))}
            </ul>
            <Field orientation="horizontal">
              <Checkbox
                id={leaveId}
                checked={leaveInstitutions}
                onCheckedChange={(v) => setLeaveInstitutions(v === true)}
              />
              <FieldLabel htmlFor={leaveId} className="font-normal">
                {t("demoteLeave")}
              </FieldLabel>
            </Field>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        {...dialog("editor")}
        title={
          target.isProtocolEditor
            ? t("editorDemoteTitle", { name: target.name })
            : t("editorPromoteTitle", { name: target.name })
        }
        description={
          target.isProtocolEditor
            ? t("editorDemoteDescription")
            : t("editorPromoteDescription")
        }
        confirmLabel={
          target.isProtocolEditor ? t("removeEditor") : t("makeEditor")
        }
        destructive={target.isProtocolEditor}
        onConfirm={changeEditor}
      />

      <BanDialog {...dialog("ban")} target={target} />

      <ConfirmDialog
        {...dialog("unban")}
        title={t("unbanTitle", { name: target.name })}
        description={t("unbanDescription")}
        confirmLabel={t("unban")}
        onConfirm={async () =>
          errorOf(
            await run(unbanUserAction, { userId: target.id }, t("unbanned")),
          )
        }
      />

      <ConfirmDialog
        {...dialog("revoke")}
        title={t("revokeAllTitle", { name: target.name })}
        description={t("revokeAllDescription")}
        confirmLabel={t("revokeAll")}
        destructive
        onConfirm={async () =>
          errorOf(
            await run(
              revokeUserSessionsAction,
              { userId: target.id },
              t("revokedAll"),
            ),
          )
        }
      />

      <ConfirmDialog
        {...dialog("impersonate")}
        title={t("impersonateTitle", { name: target.name })}
        description={
          <>
            <p>{t("impersonateDescription")}</p>
            <p className="mt-2">
              {t.rich("impersonateReturn", {
                code: (chunks) => (
                  <code dir="ltr" className="font-mono">
                    {chunks}
                  </code>
                ),
              })}
            </p>
          </>
        }
        confirmLabel={t("impersonateStart")}
        onConfirm={impersonate}
      />

      {deletionBlocked ? (
        <Dialog {...dialog("delete")}>
          <DialogContent showCloseButton={false} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("blockedTitle")}</DialogTitle>
              <DialogDescription>
                {t("blockedDescription", { name: target.name })}
              </DialogDescription>
            </DialogHeader>
            <Alert variant="destructive">
              <ShieldQuestionIcon aria-hidden />
              <AlertDescription className="flex flex-col gap-1">
                {target.soleOwnerOf.length > 0 && (
                  <p>
                    {t("blockedOwner", {
                      organizations: new Intl.ListFormat(locale, {
                        type: "conjunction",
                      }).format(target.soleOwnerOf),
                    })}
                  </p>
                )}
                {target.lastPlatformAdmin && <p>{t("blockedAdmin")}</p>}
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {actions("close")}
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <ConfirmDialog
          {...dialog("delete")}
          title={t("deleteTitle", { name: target.name })}
          description={
            <>
              <p>{t("deleteDescription")}</p>
              <p className="mt-2">{t("deleteKeeps")}</p>
            </>
          }
          confirmLabel={t("deleteSubmit")}
          destructive
          typeToConfirm={[target.email]}
          typeLabel={t("deleteConfirm")}
          typeValue={target.email}
          typeDir="ltr"
          onConfirm={async (typed) => {
            const result = await run(
              removeUserAction,
              { userId: target.id, confirmEmail: typed },
              t("deleted"),
              { refresh: false },
            );
            return result.ok
              ? { navigate: () => router.replace("/admin/users") }
              : errorOf(result);
          }}
        />
      )}
    </div>
  );
}

function BanDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: UserActionsTarget;
}) {
  const t = useTranslations("admin.user.actions");
  const actions = useTranslations("common.actions");
  const errorMap = useZodErrorMap();
  const run = useAdminAction();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<BanFormValues>({
    resolver: zodResolver(banFormSchema, { error: errorMap }),
    defaultValues: { reason: "", duration: "7" },
  });
  const durations = Object.fromEntries(
    BAN_DURATIONS.map((d) => [d, t(`durations.${d}`)]),
  );

  function change(next: boolean) {
    if (form.formState.isSubmitting) return;
    if (next) {
      form.reset({ reason: "", duration: "7" });
      setFormError(null);
    }
    onOpenChange(next);
  }

  async function submit(values: BanFormValues) {
    setFormError(null);
    const result = await run(
      banUserAction,
      { userId: target.id, ...values },
      t("banned"),
    );
    const error = errorOf(result);
    if (error) setFormError(error);
    else if (result.ok) onOpenChange(false);
  }

  const submitting = form.formState.isSubmitting;
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{t("banTitle", { name: target.name })}</DialogTitle>
          <DialogDescription>{t("banDescription")}</DialogDescription>
        </DialogHeader>
        <form
          id="ban-form"
          noValidate
          onSubmit={form.handleSubmit(submit)}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Controller
              name="reason"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="ban-reason">{t("banReason")}</FieldLabel>
                  <Textarea
                    id="ban-reason"
                    rows={3}
                    maxLength={BAN_REASON_MAX}
                    aria-invalid={fieldState.invalid}
                    {...field}
                  />
                  <FieldDescription>{t("banReasonHint")}</FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="duration"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="ban-duration">
                    {t("banDuration")}
                  </FieldLabel>
                  <Select
                    items={durations}
                    value={field.value}
                    onValueChange={(v) => field.onChange(v ?? "7")}
                  >
                    <SelectTrigger
                      id="ban-duration"
                      className="w-full"
                      onBlur={field.onBlur}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BAN_DURATIONS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {t(`durations.${d}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          </FieldGroup>
          <FormError message={formError} />
        </form>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" />}
            disabled={submitting}
          >
            {actions("cancel")}
          </DialogClose>
          <Button
            type="submit"
            form="ban-form"
            variant="destructive"
            disabled={submitting}
          >
            {submitting && <Spinner />}
            {t("banSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
