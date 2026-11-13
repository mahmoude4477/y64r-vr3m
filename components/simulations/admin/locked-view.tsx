import { CircleCheckIcon, CircleXIcon, LockIcon, ShieldAlertIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { laterDraft } from "@/lib/simulations/admin/content";
import type { EditorData } from "@/lib/simulations/admin/queries";
import { pick, pickOrNull } from "@/lib/i18n-content";
import { cn } from "@/lib/utils";
import { DifficultyBadge } from "../scenario-meta";
import { EditorHeader, VersionList } from "./editor-header";
import { NewVersionAction, StatusActions } from "./status-actions";

/**
 * A scenario that trainees have attempted: never edited in place (CONVENTIONS 6). Shows why, the way forward (a new
 * version, or the draft of it that already exists), publish / unpublish, and the content of this version read-only.
 */
export function LockedScenario({ data }: { data: EditorData }) {
  const t = useTranslations("simulations.admin.locked");
  const tf = useTranslations("simulations.admin.fields");
  const te = useTranslations("simulations.admin.editor");
  const format = useFormatter();
  const locale = useLocale();
  const n = (value: number) => format.number(value, "integer");
  const protocol = data.protocols.find((p) => p.id === data.content.protocolId) ?? null;
  const stepText = new Map((protocol?.steps ?? []).map((s) => [s.id, `${n(s.order)}. ${s.text}`]));
  const draft = laterDraft(data, data.family);
  const content = data.content;

  return (
    <div className="flex flex-col gap-6">
      <EditorHeader
        title={data.title}
        slug={data.slug}
        version={data.version}
        isPublished={data.isPublished}
        played
        owner={data.owner}
        protocol={protocol ? { title: protocol.title, icon: protocol.icon } : null}
        actions={<StatusActions id={data.id} isPublished={data.isPublished} attempts={data.attempts} family={data.family} />}
      />

      <Alert className="border-primary/30 bg-primary/5">
        <LockIcon aria-hidden />
        <AlertTitle>{t("title")}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>{t("description", { count: data.attempts.total, n: n(data.attempts.total) })}</p>
          <NewVersionAction id={data.id} draft={draft} />
        </AlertDescription>
      </Alert>

      <VersionList family={data.family} currentId={data.id} />

      <section aria-labelledby="locked-content" className="flex flex-col gap-4">
        <h2 id="locked-content" className="text-lg font-semibold">
          {t("content")}
        </h2>
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <li>
              <DifficultyBadge level={content.difficulty} />
            </li>
            <li>{tf("minutes")}: {n(content.estimatedMinutes)}</li>
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">{pick(content, "intro", locale)}</p>
          <p className="text-sm leading-relaxed">{pick(content, "setting", locale)}</p>
        </div>
        <ol className="flex flex-col gap-4">
          {content.stages.map((stage, i) => (
            <li key={i}>
              <article aria-labelledby={`locked-stage-${i}`} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id={`locked-stage-${i}`} className="text-sm font-semibold text-muted-foreground">
                    {te("stage", { n: n(i + 1) })}
                  </h3>
                  <Badge variant="secondary">{stage.kind === "single" ? tf("kindSingle") : tf("kindMulti")}</Badge>
                </div>
                {pickOrNull(stage, "context", locale) && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{pickOrNull(stage, "context", locale)}</p>
                )}
                <p className="font-medium leading-relaxed">{pick(stage, "prompt", locale)}</p>
                <ul className="flex flex-col gap-2">
                  {stage.options.map((option, j) => {
                    const Icon = option.isCorrect ? CircleCheckIcon : CircleXIcon;
                    return (
                      <li
                        key={j}
                        className={cn("flex flex-col gap-1 rounded-lg border p-3", option.isCorrect ? "border-success/40 bg-success/5" : "bg-background")}
                      >
                        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <span className="inline-flex items-center gap-1">
                            <Icon aria-hidden className={cn("size-4", option.isCorrect ? "text-success" : "text-muted-foreground")} />
                            {option.isCorrect ? t("correct") : t("wrong")}
                          </span>
                          {option.isCritical && (
                            <Badge variant="destructive">
                              <ShieldAlertIcon aria-hidden />
                              {tf("critical")}
                            </Badge>
                          )}
                        </p>
                        <p className="text-sm font-medium leading-relaxed">{pick(option, "text", locale)}</p>
                        <p className="text-sm leading-relaxed text-muted-foreground">{pick(option, "feedback", locale)}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold">{tf("step")}: </span>
                          {(option.stepId && stepText.get(option.stepId)) || t("noStep")}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </article>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
