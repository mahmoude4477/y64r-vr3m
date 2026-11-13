"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon, InfoIcon, RotateCwIcon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { type FieldPath, useForm, useFormState, useWatch } from "react-hook-form";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { saveScenarioAction } from "@/lib/simulations/admin/actions";
import { scenarioContentSchema, type ScenarioFormValues } from "@/lib/simulations/admin/content";
import { withScenarioIssues } from "@/lib/simulations/admin/error-map";
import type { EditorData } from "@/lib/simulations/admin/queries";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { cn } from "@/lib/utils";
import { EditorHeader, VersionList } from "./editor-header";
import { useAdminErrorText } from "./errors";
import { MetaFields } from "./meta-fields";
import { StagesEditor } from "./stages-editor";
import { StatusActions } from "./status-actions";

const BUSY = "aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

/**
 * The scenario editor (platform admin) for a scenario nobody has attempted yet: basics, then the ordered stages and
 * options, saved in one go with the same rules on both sides (lib/simulations/admin/content.ts). The save sends the
 * updatedAt it loaded, so a concurrent change is reported instead of overwritten; unsaved changes block publishing
 * and ask before the page is left.
 */
export function ScenarioEditor({ data }: { data: EditorData }) {
  const t = useTranslations("simulations.admin.editor");
  const tIssues = useTranslations("simulations.admin.issues");
  const tErrors = useTranslations("simulations.admin.errors");
  const format = useFormatter();
  const locale = useLocale();
  const errorText = useAdminErrorText();
  const baseMap = useZodErrorMap();
  const errorMap = useMemo(() => withScenarioIssues(baseMap, (key) => tIssues(key)), [baseMap, tIssues]);
  const stepSets = useMemo(() => new Map(data.protocols.map((p) => [p.id, new Set(p.steps.map((s) => s.id))])), [data.protocols]);
  const schema = useMemo(() => scenarioContentSchema((pid) => stepSets.get(pid)), [stepSets]);

  const form = useForm<ScenarioFormValues>({ resolver: zodResolver(schema, { error: errorMap }), defaultValues: data.content });
  const { isDirty, isSubmitting } = useFormState({ control: form.control });
  const protocolId = useWatch({ control: form.control, name: "protocolId" });
  const protocol = data.protocols.find((p) => p.id === protocolId) ?? null;

  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<{ text: string; reload: boolean } | null>(null);
  const [protocolNotice, setProtocolNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The newest of the loaded version and the one this page saved (ISO strings in the same format sort by time).
  const expectedUpdatedAt = savedAt && savedAt > data.updatedAt ? savedAt : data.updatedAt;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  /** A step link of the old protocol means nothing in the new one: clear it (and the critical flag that needs it). */
  function handleProtocolChange(next: string) {
    const steps = stepSets.get(next) ?? new Set<string>();
    let cleared = 0;
    form.getValues("stages").forEach((stage, i) =>
      stage.options.forEach((option, j) => {
        if (!option.stepId || steps.has(option.stepId)) return;
        cleared++;
        form.setValue(`stages.${i}.options.${j}.stepId`, null, { shouldDirty: true });
        form.setValue(`stages.${i}.options.${j}.isCritical`, false, { shouldDirty: true });
      }),
    );
    setProtocolNotice(cleared > 0 ? t("protocolChanged", { count: cleared, n: format.number(cleared, "integer") }) : null);
  }

  async function onValid(values: ScenarioFormValues) {
    setError(null);
    setAnnouncement("");
    try {
      const result = await saveScenarioAction(locale, { id: data.id, expectedUpdatedAt, content: values });
      if (!result.ok) {
        for (const issue of result.fieldIssues ?? []) form.setError(issue.path as FieldPath<ScenarioFormValues>, { message: issue.message });
        const issues = result.issues?.map((key) => tIssues(key)).join(" ");
        setError({
          text: issues ? `${errorText(result.error)} ${issues}` : errorText(result.error),
          reload: result.error === "stale" || result.error === "has_attempts" || result.error === "not_found",
        });
        return;
      }
      form.reset(values);
      setSavedAt(result.updatedAt);
      // The save bar turns to "All changes saved"; screen readers hear it from the live region (no toast over the bar).
      setAnnouncement(t("saved"));
    } catch {
      setError({ text: errorText("network"), reload: false });
    }
  }

  function onInvalid() {
    setError({ text: t("invalid"), reload: false });
    // react-hook-form focuses the first invalid field; a stage-level problem (e.g. no correct option) has no field,
    // so focus its message instead.
    requestAnimationFrame(() => {
      const root = formRef.current;
      const active = document.activeElement;
      if (!root || (active && root.contains(active) && active.getAttribute("type") !== "submit")) return;
      root.querySelector<HTMLElement>("[data-error-anchor], [aria-invalid='true']")?.focus();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <EditorHeader
        title={data.title}
        slug={data.slug}
        version={data.version}
        isPublished={data.isPublished}
        owner={data.owner}
        protocol={protocol ? { title: protocol.title, icon: protocol.icon } : null}
        actions={<StatusActions id={data.id} isPublished={data.isPublished} attempts={data.attempts} family={data.family} dirty={isDirty} />}
      />
      {data.isPublished && (
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>{t("liveWarning")}</AlertDescription>
        </Alert>
      )}
      {protocol && !protocol.isPublished && (
        <Alert className="border-warning/40 bg-warning/5">
          <TriangleAlertIcon aria-hidden />
          <AlertDescription>{t("protocolUnpublished")}</AlertDescription>
        </Alert>
      )}

      <form
        ref={formRef}
        onSubmit={(event) => {
          // A second click while saving must not send the same version twice (it would come back as "stale").
          if (form.formState.isSubmitting) return event.preventDefault();
          void form.handleSubmit(onValid, onInvalid)(event);
        }}
        noValidate
        className="flex flex-col gap-6"
      >
        <section aria-labelledby="editor-basics" className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 id="editor-basics" className="text-lg font-semibold">
              {t("basics")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("basicsDescription")}</p>
          </div>
          <MetaFields control={form.control} protocols={data.protocols} onProtocolChange={handleProtocolChange} />
          {protocolNotice && (
            <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
              <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              {protocolNotice}
            </p>
          )}
        </section>

        <section aria-labelledby="editor-stages" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="editor-stages" className="text-lg font-semibold">
              {t("stages")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("stagesDescription")}</p>
          </div>
          <StagesEditor form={form} steps={protocol?.steps ?? []} />
        </section>

        {error && (
          <Alert variant="destructive" role="alert">
            <CircleAlertIcon aria-hidden />
            <AlertDescription>{error.text}</AlertDescription>
            {error.reload && (
              <AlertAction>
                <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
                  <RotateCwIcon aria-hidden />
                  {tErrors("reload")}
                </Button>
              </AlertAction>
            )}
          </Alert>
        )}

        <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur print:hidden">
          <p className={cn("inline-flex items-center gap-2 text-sm", isDirty ? "font-medium" : "text-muted-foreground")}>
            <span aria-hidden className={cn("size-2 rounded-full", isDirty ? "bg-warning" : "bg-success")} />
            {isDirty ? t("unsaved") : t("upToDate")}
          </p>
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
          <div className="flex flex-col items-end gap-1">
            <Button type="submit" className={BUSY} aria-disabled={isSubmitting || undefined}>
              {isSubmitting ? <Spinner aria-hidden /> : <SaveIcon aria-hidden />}
              {isSubmitting ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
        {isDirty && <p className="-mt-4 text-xs text-muted-foreground">{t("previewSaved")}</p>}
      </form>

      <VersionList family={data.family} currentId={data.id} />
    </div>
  );
}
