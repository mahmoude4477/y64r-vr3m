"use client";

import { CircleAlertIcon, CopyPlusIcon, EyeIcon, EyeOffIcon, RocketIcon, Trash2Icon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link, useRouter } from "@/i18n/navigation";
import {
  type ActionFailure,
  createVersionAction,
  deleteDraftAction,
  publishScenarioAction,
  unpublishScenarioAction,
} from "@/lib/simulations/admin/actions";
import type { FamilyMember } from "@/lib/simulations/admin/queries";
import { cn } from "@/lib/utils";
import { useAdminErrorText } from "./errors";

/**
 * A busy button keeps focus (aria-disabled, the handler ignores clicks) instead of `disabled`, so keyboard and screen
 * reader users do not lose their place (WCAG 2.4.3), same rule as the player.
 */
const BUSY = "aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

export type StatusActionsProps = {
  id: string;
  isPublished: boolean;
  attempts: { total: number; inProgress: number };
  family: FamilyMember[];
  /** Unsaved edits in the editor: publishing is held until they are saved. */
  dirty?: boolean;
};

/** Preview, publish / unpublish and delete-draft for one scenario, each confirmed in a dialog. */
export function StatusActions({ id, isPublished, attempts, family, dirty = false }: StatusActionsProps) {
  const t = useTranslations("simulations.admin.actions");
  const tc = useTranslations("common.actions");
  const tIssues = useTranslations("simulations.admin.issues");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const errorText = useAdminErrorText();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"publish" | "unpublish" | "delete" | null>(null);

  const replaced = family.filter((f) => f.id !== id && f.isPublished);
  // Attempts in progress on the versions being replaced are closed as unfinished when this one is published (SPEC-2).
  const replacedInProgress = replaced.reduce((sum, f) => sum + f.inProgress, 0);
  const canDelete = !isPublished && attempts.total === 0;

  function failure(result: ActionFailure) {
    const issues = result.issues?.map((key) => tIssues(key)).join(" ");
    setError(issues ? `${errorText(result.error)} ${issues}` : errorText(result.error));
  }

  function run(kind: "publish" | "unpublish" | "delete") {
    if (pending) return;
    setDialog(null);
    setError(null);
    startTransition(async () => {
      try {
        if (kind === "delete") {
          const result = await deleteDraftAction(locale, { id });
          if (!result.ok) return failure(result);
          toast.success(t("deleted"));
          router.push("/admin/scenarios");
          return;
        }
        const result = await (kind === "publish" ? publishScenarioAction : unpublishScenarioAction)(locale, { id });
        if (!result.ok) return failure(result);
        toast.success(kind === "publish" ? t("published") : t("unpublished"));
      } catch {
        setError(errorText("network"));
      }
    });
  }

  const versions = replaced.map((f) => format.number(f.version, "integer")).join(locale === "ar" ? "، " : ", ");

  return (
    <div className="flex flex-col items-stretch gap-3 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/scenarios/${id}/preview`} className={buttonVariants({ variant: "outline" })}>
          <EyeIcon aria-hidden />
          {t("preview")}
        </Link>
        {isPublished ? (
          <ConfirmButton
            open={dialog === "unpublish"}
            onOpenChange={(open) => setDialog(open ? "unpublish" : null)}
            trigger={
              <>
                {pending ? <Spinner aria-hidden /> : <EyeOffIcon aria-hidden />}
                {pending ? t("unpublishing") : t("unpublish")}
              </>
            }
            variant="outline"
            busy={pending}
            title={t("unpublishTitle")}
            description={
              <>
                {t("unpublishDescription")}
                {attempts.inProgress > 0 && (
                  <span className="mt-2 block">{t("unpublishInProgress", { count: attempts.inProgress, n: format.number(attempts.inProgress, "integer") })}</span>
                )}
              </>
            }
            confirm={t("unpublish")}
            cancel={tc("cancel")}
            onConfirm={() => run("unpublish")}
          />
        ) : (
          <ConfirmButton
            open={dialog === "publish"}
            onOpenChange={(open) => setDialog(open ? "publish" : null)}
            trigger={
              <>
                {pending ? <Spinner aria-hidden /> : <RocketIcon aria-hidden />}
                {pending ? t("publishing") : t("publish")}
              </>
            }
            busy={pending || dirty}
            describedBy={dirty ? `publish-hint-${id}` : undefined}
            title={t("publishTitle")}
            description={
              <>
                {t("publishDescription")}
                {replaced.length > 0 && (
                  <span className="mt-2 block">{t("publishReplaces", { count: replaced.length, versions })}</span>
                )}
                {replacedInProgress > 0 && (
                  <span className="mt-2 block">
                    {t("publishAbandons", { count: replacedInProgress, n: format.number(replacedInProgress, "integer") })}
                  </span>
                )}
              </>
            }
            confirm={t("publish")}
            cancel={tc("cancel")}
            onConfirm={() => run("publish")}
          />
        )}
        {canDelete && (
          <ConfirmButton
            open={dialog === "delete"}
            onOpenChange={(open) => setDialog(open ? "delete" : null)}
            trigger={
              <>
                <Trash2Icon aria-hidden />
                {t("delete")}
              </>
            }
            variant="ghost"
            destructive
            busy={pending}
            title={t("deleteTitle")}
            description={t("deleteDescription")}
            confirm={t("delete")}
            cancel={tc("cancel")}
            onConfirm={() => run("delete")}
          />
        )}
      </div>
      {dirty && !isPublished && (
        <p id={`publish-hint-${id}`} className="text-xs text-muted-foreground">
          {t("publishSaveFirst")}
        </p>
      )}
      {error && (
        <Alert variant="destructive" role="alert" className="text-start sm:max-w-md">
          <CircleAlertIcon aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ConfirmButton({
  open,
  onOpenChange,
  trigger,
  variant = "default",
  destructive = false,
  busy,
  describedBy,
  title,
  description,
  confirm,
  cancel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  destructive?: boolean;
  busy: boolean;
  describedBy?: string;
  title: string;
  description: React.ReactNode;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => onOpenChange(next && !busy)}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant={variant}
            className={cn(BUSY, destructive && "text-destructive hover:text-destructive")}
            aria-disabled={busy || undefined}
            aria-describedby={describedBy}
          />
        }
      >
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancel}</AlertDialogCancel>
          <AlertDialogAction type="button" variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * "Create a new version" for a locked scenario (it has attempts), or a link to the draft of the next version when it
 * already exists.
 */
export function NewVersionAction({ id, draft }: { id: string; draft: FamilyMember | null }) {
  const t = useTranslations("simulations.admin.locked");
  const ta = useTranslations("simulations.admin.actions");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const errorText = useAdminErrorText();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (draft) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t("draftExists")}</p>
        <Link href={`/admin/scenarios/${draft.id}`} className={cn(buttonVariants(), "self-start")}>
          <CopyPlusIcon aria-hidden />
          {t("openVersion", { n: format.number(draft.version, "integer") })}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className={cn(BUSY, "self-start")}
        aria-disabled={pending || undefined}
        onClick={() => {
          if (pending) return;
          setError(null);
          startTransition(async () => {
            try {
              const result = await createVersionAction(locale, { id });
              if (!result.ok) {
                setError(errorText(result.error));
                return;
              }
              const n = format.number(result.version, "integer");
              toast.success(result.existing ? ta("versionExists", { n }) : ta("versionCreated", { n }));
              router.push(`/admin/scenarios/${result.id}`);
            } catch {
              setError(errorText("network"));
            }
          });
        }}
      >
        {pending ? <Spinner aria-hidden /> : <CopyPlusIcon aria-hidden />}
        {pending ? t("creating") : t("createVersion")}
      </Button>
      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlertIcon aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
