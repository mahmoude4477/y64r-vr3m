"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CirclePauseIcon, CirclePlayIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { OrganizationProfileFields } from "@/components/admin/organization-form";
import { errorOf, useAdminAction } from "@/components/admin/use-admin-action";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { deleteOrganizationAction, setOrganizationSuspendedAction, updateOrganizationAction } from "@/lib/admin/organization-actions";
import { organizationProfileSchema, type OrganizationProfileValues } from "@/lib/admin/schemas";
import type { OrganizationType } from "@/lib/permissions";
import { useZodErrorMap } from "@/lib/use-zod-error-map";

export type OrganizationActionsTarget = {
  id: string;
  name: string;
  nameEn: string | null;
  type: OrganizationType | null;
  suspended: boolean;
  /** The name in the page language (dialog titles). */
  displayName: string;
  members: number;
  scans: number;
};

/** Edit, suspend / reactivate and delete an institution (the admin panel's own audited writes). */
export function OrganizationActions({ org }: { org: OrganizationActionsTarget }) {
  const t = useTranslations("admin.org");
  const format = useFormatter();
  const router = useRouter();
  const run = useAdminAction();
  const [open, setOpen] = useState<null | "edit" | "suspend" | "delete">(null);
  const dialog = (key: "suspend" | "delete") => ({ open: open === key, onOpenChange: (v: boolean) => setOpen(v ? key : null) });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setOpen("edit")}>
          <PencilIcon aria-hidden />
          {t("edit")}
        </Button>
        <Button variant="outline" onClick={() => setOpen("suspend")}>
          {org.suspended ? <CirclePlayIcon aria-hidden /> : <CirclePauseIcon aria-hidden />}
          {org.suspended ? t("unsuspend") : t("suspend")}
        </Button>
        <Button variant="destructive" onClick={() => setOpen("delete")}>
          <Trash2Icon aria-hidden />
          {t("delete")}
        </Button>
      </div>

      <EditOrganizationDialog org={org} open={open === "edit"} onOpenChange={(v) => setOpen(v ? "edit" : null)} />

      <ConfirmDialog
        {...dialog("suspend")}
        title={org.suspended ? t("unsuspendTitle", { name: org.displayName }) : t("suspendTitle", { name: org.displayName })}
        description={org.suspended ? t("unsuspendDescription") : t("suspendDescription")}
        confirmLabel={org.suspended ? t("unsuspend") : t("suspend")}
        destructive={!org.suspended}
        onConfirm={async () =>
          errorOf(
            await run(
              setOrganizationSuspendedAction,
              { organizationId: org.id, suspended: !org.suspended },
              org.suspended ? t("unsuspended") : t("suspended"),
            ),
          )
        }
      />

      <ConfirmDialog
        {...dialog("delete")}
        title={t("deleteTitle", { name: org.displayName })}
        description={
          <>
            <p>{t("deleteDescription")}</p>
            <p className="mt-2 font-medium text-foreground">
              {t("deleteImpact", {
                members: org.members,
                m: format.number(org.members, "integer"),
                scans: org.scans,
                s: format.number(org.scans, "integer"),
              })}
            </p>
            <p className="mt-2">{t("deleteKeeps")}</p>
          </>
        }
        confirmLabel={t("deleteSubmit")}
        destructive
        typeToConfirm={[org.name, org.nameEn]}
        typeLabel={t("deleteConfirm")}
        typeValue={org.displayName}
        onConfirm={async (typed) => {
          const result = await run(deleteOrganizationAction, { organizationId: org.id, confirmName: typed }, t("deleted"), { refresh: false });
          return result.ok ? { navigate: () => router.replace("/admin/organizations") } : errorOf(result);
        }}
      />
    </>
  );
}

function EditOrganizationDialog({
  org,
  open,
  onOpenChange,
}: {
  org: OrganizationActionsTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.org");
  const actions = useTranslations("common.actions");
  const errorMap = useZodErrorMap();
  const run = useAdminAction();
  const [formError, setFormError] = useState<string | null>(null);
  const defaults: OrganizationProfileValues = {
    nameAr: org.name,
    nameEn: org.nameEn ?? "",
    type: (org.type ?? "") as OrganizationProfileValues["type"],
  };
  const form = useForm<OrganizationProfileValues>({ resolver: zodResolver(organizationProfileSchema, { error: errorMap }), defaultValues: defaults });

  function change(next: boolean) {
    if (form.formState.isSubmitting) return;
    if (next) {
      form.reset(defaults);
      setFormError(null);
    }
    onOpenChange(next);
  }

  async function submit(values: OrganizationProfileValues) {
    setFormError(null);
    const result = await run(updateOrganizationAction, { organizationId: org.id, ...values }, t("updated"));
    const error = errorOf(result);
    if (error) setFormError(error);
    else if (result.ok) onOpenChange(false);
  }

  const submitting = form.formState.isSubmitting;
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>
        <form id="edit-org-form" noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
          <OrganizationProfileFields control={form.control} idPrefix="edit-org" />
          <FormError message={formError} />
        </form>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} disabled={submitting}>
            {actions("cancel")}
          </DialogClose>
          <Button type="submit" form="edit-org-form" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? t("saving") : t("editSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
