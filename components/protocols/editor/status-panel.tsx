"use client";

import { CopyPlusIcon, ExternalLinkIcon, EyeOffIcon, InfoIcon, SendIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link, useRouter } from "@/i18n/navigation";
import { createProtocolVersion, deleteProtocolDraft, type EditorFailure, setProtocolPublished } from "@/lib/protocols/editor-actions";
import type { EditorProtocol } from "@/lib/protocols/editor-queries";
import { editorBasePath, type EditorScope, SCENARIO_EDITOR_PATH } from "@/lib/protocols/editor-scope";
import { protocolHasHistory } from "@/lib/protocols/history";
import { cn } from "@/lib/utils";
import { ConfirmAction, type ConfirmFailure } from "./confirm-action";
import { EDITOR_TOAST } from "./editor-toast";
import { ProtocolStatusBadge } from "./status-badge";

/** A failed action -> what its dialog shows (a conflict offers the reload the save form offers too). */
export function toConfirmFailure(r: EditorFailure): ConfirmFailure {
  return { message: r.message, reload: r.error === "conflict" };
}

/**
 * The editor's side panel: status and who can see it, publish / unpublish, a new version (protocols with history),
 * delete (unused drafts only), what uses the protocol, and how changes work. Publishing and versioning act on the
 * SAVED protocol, so they wait until the form has no unsaved changes.
 */
export function StatusPanel({
  kind,
  protocol,
  dirty,
  version,
  onVersion,
  beforeNavigate,
}: {
  kind: EditorScope;
  protocol: EditorProtocol;
  dirty: boolean;
  version: string;
  onVersion: (version: string) => void;
  /** Lets the unsaved-changes guard step aside before the panel leaves the page on purpose (new version, delete). */
  beforeNavigate: () => Promise<void>;
}) {
  const t = useTranslations("protocols.editor");
  const locale = useLocale();
  const router = useRouter();
  const base = editorBasePath(kind);
  const published = protocol.isPublished;
  const history = protocolHasHistory(protocol.usage);
  const network = { message: t("errors.network") };
  const id = useId();
  const scenarioLink = (chunks: ReactNode) =>
    kind === "global" ? (
      <Link href={SCENARIO_EDITOR_PATH} className="font-medium text-primary underline underline-offset-4">
        {chunks}
      </Link>
    ) : (
      chunks
    );

  async function publish(next: boolean): Promise<ConfirmFailure | null> {
    try {
      const r = await setProtocolPublished(locale, kind, { id: protocol.id, version, publish: next });
      if (!r.ok) return toConfirmFailure(r);
      onVersion(r.version);
      toast.success(next ? t("toasts.published") : t("toasts.unpublished"), EDITOR_TOAST);
      return null;
    } catch {
      return network;
    }
  }

  async function newVersion(): Promise<ConfirmFailure | null> {
    try {
      const r = await createProtocolVersion(locale, kind, { id: protocol.id });
      if (!r.ok) return toConfirmFailure(r);
      toast.success(t("toasts.versioned"), EDITOR_TOAST);
      await beforeNavigate();
      router.push(`${base}/${r.id}`);
      return null;
    } catch {
      return network;
    }
  }

  async function remove(): Promise<ConfirmFailure | null> {
    try {
      const r = await deleteProtocolDraft(locale, kind, { id: protocol.id });
      if (!r.ok) return toConfirmFailure(r);
      toast.success(t("toasts.deleted"), EDITOR_TOAST);
      await beforeNavigate();
      router.replace(base);
      return null;
    } catch {
      return network;
    }
  }

  const audience = kind === "global" ? (published ? "globalPublished" : "globalDraft") : published ? "institutionPublished" : "institutionDraft";
  const { scenarios, copies } = protocol.usage;
  // What stays attached to THIS protocol when it is unpublished or replaced by a version.
  const scenarioNote = (moveKey: "moveScenarios" | "hiddenScenarios") =>
    scenarios > 0 ? (
      <span className="block pt-2">
        {kind === "global"
          ? t.rich(`dialogs.${moveKey}`, { count: scenarios, link: scenarioLink })
          : t(`dialogs.${moveKey}Institution`, { count: scenarios })}
      </span>
    ) : null;
  const copiesNote = kind === "global" && copies > 0 ? <span className="block pt-2">{t("dialogs.copiesKeep", { count: copies })}</span> : null;

  return (
    <section aria-labelledby={`${id}-status`} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-status`} className="text-base font-semibold">
          {t("status.label")}
        </h2>
        <ProtocolStatusBadge published={published} />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{t(`audience.${audience}`)}</p>
      {dirty && (
        <p id={`${id}-save-first`} className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t("saveBar.saveFirst")}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {published ? (
          <ConfirmAction
            label={t("actions.unpublish")}
            icon={<EyeOffIcon aria-hidden />}
            title={t("dialogs.unpublish.title")}
            description={
              <>
                {t(`dialogs.unpublish.${kind}`)}
                {scenarioNote(protocol.newerVersion ? "moveScenarios" : "hiddenScenarios")}
                {copiesNote}
              </>
            }
            confirmLabel={t("actions.unpublish")}
            pendingLabel={t("actions.unpublishing")}
            disabled={dirty}
            describedBy={dirty ? `${id}-save-first` : undefined}
            onConfirm={() => publish(false)}
          />
        ) : (
          <ConfirmAction
            label={t("actions.publish")}
            icon={<SendIcon aria-hidden className="rtl:-scale-x-100" />}
            variant="default"
            title={t("dialogs.publish.title")}
            description={t(`dialogs.publish.${kind}`)}
            confirmLabel={t("actions.publish")}
            pendingLabel={t("actions.publishing")}
            disabled={dirty}
            describedBy={dirty ? `${id}-save-first` : undefined}
            onConfirm={() => publish(true)}
          />
        )}
        {published && (
          <Link href={`/protocols/${protocol.slug}`} className={cn(buttonVariants({ variant: "ghost" }), "h-9 w-full")}>
            <ExternalLinkIcon aria-hidden />
            {t("actions.viewInLibrary")}
          </Link>
        )}
      </div>

      {(history || protocol.deletable.ok) && <Separator />}
      {history && (
        <div className="flex flex-col gap-2">
          <p id={`${id}-version-hint`} className="text-xs leading-relaxed text-muted-foreground">
            {t("history.versionHint")}
          </p>
          <ConfirmAction
            label={t("actions.newVersion")}
            icon={<CopyPlusIcon aria-hidden />}
            variant="secondary"
            title={t("dialogs.version.title")}
            description={
              <>
                {t("dialogs.version.description")}
                {scenarioNote("moveScenarios")}
                {kind === "global" && copies > 0 ? <span className="block pt-2">{t("dialogs.version.copies", { count: copies })}</span> : null}
              </>
            }
            confirmLabel={t("actions.newVersion")}
            pendingLabel={t("actions.creatingVersion")}
            disabled={dirty}
            describedBy={dirty ? `${id}-save-first ${id}-version-hint` : `${id}-version-hint`}
            onConfirm={newVersion}
          />
        </div>
      )}
      {protocol.deletable.ok && (
        <ConfirmAction
          label={t("actions.delete")}
          icon={<Trash2Icon aria-hidden />}
          variant="destructive"
          destructive
          title={t("dialogs.delete.title")}
          description={t("dialogs.delete.description")}
          confirmLabel={t("actions.delete")}
          pendingLabel={t("actions.deleting")}
          onConfirm={remove}
        />
      )}
    </section>
  );
}

/**
 * What uses the protocol (scans, scenarios, step results, scenario answers, institution copies), and whether it can
 * be deleted. Institution protocols cannot be copied, so they have no copies line.
 */
export function UsagePanel({ kind, protocol }: { kind: EditorScope; protocol: EditorProtocol }) {
  const t = useTranslations("protocols.editor.history");
  const id = useId();
  const u = protocol.usage;
  const items = [
    { key: "scans", count: u.scans },
    { key: "scenarios", count: u.scenarios },
    { key: "results", count: u.stepResults },
    { key: "options", count: u.scenarioOptions },
    ...(kind === "global" ? [{ key: "copies", count: u.copies } as const] : []),
  ] as const;
  return (
    <section aria-labelledby={`${id}-usage`} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 id={`${id}-usage`} className="text-base font-semibold">
        {t("usageTitle")}
      </h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((item) => (
          <li key={item.key} className={cn("tabular-nums", item.count === 0 && "text-muted-foreground")}>
            {t(item.key, { count: item.count })}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {protocol.deletable.ok ? t("unused") : protocol.deletable.reason === "history" ? t("deleteBlockedHistory") : t("deleteBlockedPublished")}
      </p>
    </section>
  );
}

/** "How changes work": the history rules in plain words (create and edit pages). */
export function HowChangesWork() {
  const t = useTranslations("protocols.editor.history");
  const id = useId();
  return (
    <section aria-labelledby={`${id}-how`} className="flex flex-col gap-3 rounded-xl bg-secondary/50 p-4 ring-1 ring-border">
      <h2 id={`${id}-how`} className="text-base font-semibold">
        {t("title")}
      </h2>
      <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-muted-foreground marker:text-primary">
        <li>{t("live")}</li>
        <li>{t("pastResults")}</li>
        <li>{t("locked")}</li>
        <li>{t("version")}</li>
      </ul>
    </section>
  );
}
