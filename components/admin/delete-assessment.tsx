"use client";

import { Trash2Icon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, type ConfirmNavigate } from "@/components/admin/confirm-dialog";
import { errorOf, useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { deleteAttemptAction, deleteScanAction } from "@/lib/admin/assessment-actions";
import { DELETE_REASONS, type DeleteReason } from "@/lib/admin/assessment-filters";

/**
 * Deletes one scan (with its photos) or one simulation attempt, for abusive or test content. The admin picks a reason
 * from a fixed list (it goes into the audit row) and confirms; then the list of that kind opens.
 */
export function DeleteAssessment({
  kind,
  id,
  name,
  photos = 0,
}: {
  kind: "scan" | "attempt";
  id: string;
  /** What is deleted, in the dialog title (the area of a scan, the scenario of an attempt). */
  name: string;
  photos?: number;
}) {
  const t = useTranslations("admin.assessment.delete");
  const format = useFormatter();
  const run = useAdminAction();
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DeleteReason | null>(null);
  const [reasonError, setReasonError] = useState(false);
  const reasons = Object.fromEntries(DELETE_REASONS.map((r) => [r, t(`reasons.${r}`)]));

  async function confirm(): Promise<string | null | ConfirmNavigate> {
    if (!reason) {
      setReasonError(true);
      return t("reasonRequired");
    }
    const result =
      kind === "scan"
        ? await run(deleteScanAction, { scanId: id, reason }, undefined, { refresh: false })
        : await run(deleteAttemptAction, { attemptId: id, reason }, undefined, { refresh: false });
    const error = errorOf(result);
    if (error) return error;
    if (!result.ok) return null; // redirected (session ended)
    toast.success(kind === "scan" ? t("deletedScan") : t("deletedAttempt"));
    return { navigate: () => router.replace(kind === "scan" ? "/admin/assessments" : "/admin/assessments?kind=attempts") };
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => {
          setReason(null);
          setReasonError(false);
          setOpen(true);
        }}
      >
        <Trash2Icon aria-hidden />
        {kind === "scan" ? t("scan") : t("attempt")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive
        title={kind === "scan" ? t("scanTitle", { name }) : t("attemptTitle", { name })}
        description={
          <div className="flex flex-col gap-2">
            <p>{kind === "scan" ? t("scanDescription") : t("attemptDescription")}</p>
            {kind === "scan" && photos > 0 && <p>{t("scanPhotos", { n: format.number(photos, "integer") })}</p>}
            <p>{t("audited")}</p>
          </div>
        }
        confirmLabel={kind === "scan" ? t("scanSubmit") : t("attemptSubmit")}
        onConfirm={confirm}
      >
        <Field data-invalid={reasonError || undefined}>
          <FieldLabel htmlFor={`${fieldId}-reason`}>{t("reason")}</FieldLabel>
          <Select
            items={reasons}
            value={reason}
            onValueChange={(v) => {
              setReason((v as DeleteReason | null) ?? null);
              setReasonError(false);
            }}
          >
            <SelectTrigger id={`${fieldId}-reason`} className="w-full" aria-invalid={reasonError || undefined}>
              <SelectValue placeholder={t("reasonPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {DELETE_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {reasons[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t("reasonHint")}</FieldDescription>
        </Field>
      </ConfirmDialog>
    </>
  );
}
