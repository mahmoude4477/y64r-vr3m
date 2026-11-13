"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon, PlusIcon, RotateCwIcon, SaveIcon, Undo2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { startTransition, useEffect, useId, useMemo, useRef, useState } from "react";
import { type Control, Controller, type FieldErrors, type FieldPath, type Resolver, useFieldArray, useForm, useFormState, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { ZodType } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { createProtocol, type EditorFailure, saveProtocol } from "@/lib/protocols/editor-actions";
import { orderedErrorPaths, stepIndexesWithErrors } from "@/lib/protocols/editor-errors";
import { type EditorStepValues, type EditorValues, editorSchema, emptyStep, rewordedStepsWithResults, slugify } from "@/lib/protocols/editor-form";
import type { EditorProtocol } from "@/lib/protocols/editor-queries";
import { editorBasePath, type EditorScope } from "@/lib/protocols/editor-scope";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { MAX_STEPS_PER_PROTOCOL } from "@/lib/validation/protocol";
import { CategoryPicker, IconPicker } from "./choice-fields";
import { EDITOR_TOAST } from "./editor-toast";
import { HowChangesWork, StatusPanel, UsagePanel } from "./status-panel";
import { NO_USAGE, type RemoveBlock, StepCard } from "./step-card";
import { ARABIC_TEXT, BilingualFields, EditorFieldError } from "./text-field";
import { UnsavedChangesDialog, useUnsavedChangesGuard } from "./unsaved-changes";
import { WordingDialog, type WordingQuestion } from "./wording-dialog";

type Controls = { toggle?: HTMLButtonElement | null; up?: HTMLButtonElement | null; down?: HTMLButtonElement | null; remove?: HTMLButtonElement | null };
type FormError = { message: string; reload?: boolean };
/** A step removed in this editing session: listed under the steps with an Undo until the next save. */
type RemovedStep = { token: string; number: number; values: EditorStepValues };

/**
 * While the editor is on screen, the page's scroll padding keeps focused controls clear of the sticky app header
 * (3.5 rem) and of the editor's sticky save bar (about 4 rem): the browser treats a control under either bar as not
 * visible and scrolls it into the free area (WCAG 2.2 2.4.11, focus not obscured). A scroll margin on the controls is
 * not enough: a control half under the bar counts as visible and is not scrolled.
 */
function useFocusClearance() {
  useEffect(() => {
    const style = document.documentElement.style;
    const before = { top: style.scrollPaddingTop, bottom: style.scrollPaddingBottom };
    style.scrollPaddingTop = "4.5rem";
    style.scrollPaddingBottom = "6.5rem";
    return () => {
      style.scrollPaddingTop = before.top;
      style.scrollPaddingBottom = before.bottom;
    };
  }, []);
}

/** Dotted server field paths -> the nested shape orderedErrorPaths reads. */
function nestErrors(fieldErrors: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [path, message] of Object.entries(fieldErrors)) {
    const parts = path.split(".");
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) node[part] = { message };
      else node = (node[part] ??= {}) as Record<string, unknown>;
    });
  }
  return root;
}

/**
 * The shared protocol editor (global protocols at /admin/protocols, institution protocols at /org/protocols).
 * One form for the protocol and its ordered steps, validated in the browser with the same schema the Server Actions
 * use (lib/protocols/editor-form.ts). `protocol` null = create a new draft.
 */
export function ProtocolEditor({
  kind,
  protocol,
  initialValues,
  titleId,
}: {
  kind: EditorScope;
  protocol: EditorProtocol | null;
  initialValues: EditorValues;
  /** id of the page's h1, which names the form. */
  titleId: string;
}) {
  const t = useTranslations("protocols.editor");
  const locale = useLocale();
  const router = useRouter();
  const errorMap = useZodErrorMap();
  const isCreate = protocol === null;
  const withSlug = isCreate && kind === "global";
  // raw: the submit handler gets the form values as typed (with step ids); the server normalises them again.
  const resolver = useMemo(
    () =>
      zodResolver(editorSchema(withSlug) as unknown as ZodType<EditorValues, EditorValues>, { error: errorMap }, { raw: true }) as Resolver<EditorValues>,
    [withSlug, errorMap],
  );
  const form = useForm<EditorValues>({
    resolver,
    defaultValues: initialValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: false,
  });
  const { control, getValues, setValue } = form;
  const { fields, append, remove, move, insert } = useFieldArray({ control, name: "steps", keyName: "fieldKey" });
  const { isDirty, isSubmitting } = useFormState({ control });
  const [version, setVersion] = useState(protocol?.version ?? "");
  // Open steps, by step key (stable across moves; new steps carry a unique placeholder key).
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(isCreate && initialValues.steps[0] ? [initialValues.steps[0].key] : []));
  const [formError, setFormError] = useState<FormError | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [removed, setRemoved] = useState<RemovedStep[]>([]);
  const [wording, setWording] = useState<WordingQuestion | null>(null);
  /** The values as last saved (or loaded): what "Leave without saving" goes back to. */
  const savedValues = useRef(initialValues);
  const controls = useRef(new Map<string, Controls>());
  const pendingFocus = useRef<{ path?: string; control?: { key: string; which: keyof Controls } } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  // Unsaved changes: links, Back, closing or reloading the tab ask first; leaving without saving discards the edits.
  const guard = useUnsavedChangesGuard(isDirty, editorBasePath(kind), () => {
    form.reset(savedValues.current);
    setRemoved([]);
    setFormError(null);
  });
  useFocusClearance();

  // Focus moves after the render that shows its target (a step just opened, moved, added or restored).
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.control) {
      controls.current.get(target.control.key)?.[target.control.which]?.focus();
      return;
    }
    if (target.path) {
      const wrapper = formRef.current?.querySelector<HTMLElement>(`[data-field="${CSS.escape(target.path)}"]`);
      const el = wrapper?.querySelector<HTMLElement>(
        "textarea, input:not([type=hidden]), [role=radio][aria-checked=true], [role=radio], [role=switch], button",
      );
      (el ?? summaryRef.current)?.focus();
    }
  });

  // The address follows the English title until the admin types one.
  const titleEn = useWatch({ control, name: "titleEn" });
  const slugTyped = useRef(false);
  useEffect(() => {
    if (!withSlug || slugTyped.current) return;
    setValue("slug", slugify(titleEn ?? ""), { shouldValidate: form.formState.isSubmitted });
  }, [withSlug, titleEn, setValue, form.formState.isSubmitted]);

  function setControl(key: string, which: keyof Controls) {
    return (el: HTMLButtonElement | null) => {
      const entry = controls.current.get(key) ?? {};
      entry[which] = el;
      controls.current.set(key, entry);
    };
  }

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function moveStep(index: number, direction: -1 | 1) {
    const to = index + direction;
    const step = fields[index];
    if (!step || to < 0 || to >= fields.length) return;
    move(index, to);
    setAnnouncement(t("steps.moved", { number: String(to + 1) }));
    // Keep focus on the same button of the moved step; at an end that button is disabled, so use the other one.
    const which: keyof Controls = direction === -1 ? (to === 0 ? "down" : "up") : to === fields.length - 1 ? "up" : "down";
    pendingFocus.current = { control: { key: step.key, which } };
  }

  /** Removes a step from the form; it stays listed under the steps with an Undo until the next save. */
  function removeStep(index: number) {
    const values = getValues(`steps.${index}`);
    const neighbour = fields[index + 1] ?? fields[index - 1];
    remove(index);
    setRemoved((prev) => [...prev, { token: `${values.key}-${Date.now()}`, number: index + 1, values }]);
    setAnnouncement(t("steps.removed", { number: String(index + 1) }));
    if (neighbour) pendingFocus.current = { control: { key: neighbour.key, which: "toggle" } };
    else addRef.current?.focus();
  }

  function undoRemove(token: string) {
    const entry = removed.find((r) => r.token === token);
    if (!entry) return;
    setRemoved((prev) => prev.filter((r) => r.token !== token));
    insert(Math.min(entry.number - 1, getValues("steps").length), entry.values, { shouldFocus: false });
    setAnnouncement(t("steps.restored"));
    pendingFocus.current = { control: { key: entry.values.key, which: "toggle" } };
  }

  function blockedRemove(reason: RemoveBlock) {
    if (reason === "last") {
      toast.info(t("steps.lastStep"), EDITOR_TOAST);
      return;
    }
    toast.info(reason === "results" ? t("steps.lockedTitle") : t("steps.linkedTitle"), {
      ...EDITOR_TOAST,
      description: reason === "results" ? t("steps.locked") : t("steps.linkedNote"),
    });
  }

  function addStep() {
    if (fields.length >= MAX_STEPS_PER_PROTOCOL) return;
    const step = emptyStep();
    const index = fields.length;
    append(step, { shouldFocus: false });
    setOpen((prev) => new Set(prev).add(step.key));
    setAnnouncement(t("steps.added", { number: String(index + 1) }));
    pendingFocus.current = { path: `steps.${index}.textAr` };
  }

  /** Opens the steps that hold errors, shows the summary and focuses the first invalid field. */
  function showErrors(paths: string[], error: FormError) {
    const steps = getValues("steps");
    const keys = stepIndexesWithErrors(paths)
      .map((i) => steps[i]?.key)
      .filter((k): k is string => !!k);
    if (keys.length > 0) setOpen((prev) => new Set([...prev, ...keys]));
    setFormError(error);
    pendingFocus.current = { path: paths[0] ?? "" };
  }

  function onInvalid(errors: FieldErrors<EditorValues>) {
    const paths = orderedErrorPaths(errors);
    showErrors(paths, { message: t("errors.invalidCount", { count: paths.length }) });
  }

  function applyFailure(r: EditorFailure) {
    // The page is out of date (someone saved meanwhile, or a step got results since it loaded): offer a reload.
    const reload = r.error === "conflict" || r.error === "step_locked";
    if (r.fieldErrors && Object.keys(r.fieldErrors).length > 0) {
      for (const [path, message] of Object.entries(r.fieldErrors)) {
        form.setError(path as FieldPath<EditorValues>, { type: "server", message });
      }
      showErrors(orderedErrorPaths(nestErrors(r.fieldErrors)), { message: r.message, reload });
      return;
    }
    setFormError({ message: r.message, reload });
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  /** Asks whether to save the new wording of steps that have results (1-based numbers); resolves with the answer. */
  function confirmWording(numbers: readonly number[]): Promise<boolean> {
    const steps = getValues("steps");
    return new Promise((resolve) => {
      let answered = false;
      setWording({
        steps: numbers.map((number) => ({ number, step: steps[number - 1] })),
        answer: (save) => {
          if (answered) return;
          answered = true;
          setWording(null);
          resolve(save);
        },
      });
    });
  }

  async function onSubmit(values: EditorValues) {
    setFormError(null);
    try {
      if (protocol === null) {
        const r = await createProtocol(locale, kind, values);
        if (!r.ok) return applyFailure(r);
        toast.success(t("toasts.created"), EDITOR_TOAST);
        // The guard steps aside first (and drops its extra history entry), then both in one transition: the page
        // left behind (kept by the router) is blank again if it is reopened.
        await guard.release();
        startTransition(() => {
          form.reset(initialValues);
          router.replace(`${editorBasePath(kind)}/${r.id}`);
        });
        return;
      }
      // Past reports show a step's current wording: rewording a step that has results is confirmed first. The server
      // checks the same (a step may have got results since the page loaded) and then asks through "wording_confirm".
      const reworded = rewordedStepsWithResults(savedValues.current, values, (stepId) => protocol.stepUsage[stepId]?.results ?? 0);
      if (reworded.length > 0 && !(await confirmWording(reworded))) return;
      let r = await saveProtocol(locale, kind, { id: protocol.id, version, values, confirmWording: reworded.length > 0 });
      if (!r.ok && r.error === "wording_confirm") {
        if (!(await confirmWording(r.wordingSteps ?? []))) return;
        r = await saveProtocol(locale, kind, { id: protocol.id, version, values, confirmWording: true });
      }
      if (!r.ok) return applyFailure(r);
      savedValues.current = r.values;
      // New steps got their real keys: keep them open under the new key.
      const renamed = new Map(values.steps.map((s, i) => [s.key, r.values.steps[i]?.key ?? s.key]));
      setOpen((prev) => new Set([...prev].map((k) => renamed.get(k) ?? k)));
      setVersion(r.version);
      form.reset(r.values);
      // Removed steps are deleted now: their Undo would bring back a step that no longer exists.
      setRemoved([]);
      toast.success(t("toasts.saved"), EDITOR_TOAST);
    } catch {
      setFormError({ message: t("errors.network") });
      requestAnimationFrame(() => summaryRef.current?.focus());
    }
  }

  const stepCount = fields.length;
  const atLimit = stepCount >= MAX_STEPS_PER_PROTOCOL;
  // While the wording question is open the save waits for the answer: the bar does not say "Saving…" behind it.
  const saving = isSubmitting && wording === null;

  // Phones: status (publish) first, then the form, then usage and the rules. Wide screens: the form on the start
  // side, the panels beside it; the first row is only as tall as the status panel, the second takes the rest.
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:items-start">
      {protocol && (
        <div className="lg:col-start-2 lg:row-start-1">
          <StatusPanel kind={kind} protocol={protocol} dirty={isDirty} version={version} onVersion={setVersion} beforeNavigate={guard.release} />
        </div>
      )}
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => form.handleSubmit(onSubmit, onInvalid)(e)}
        aria-labelledby={titleId}
        data-protocol-editor=""
        className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1"
      >
        <div ref={summaryRef} tabIndex={-1} className="outline-none empty:hidden">
          {formError && (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden />
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>{formError.message}</span>
                {formError.reload && (
                  <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
                    <RotateCwIcon aria-hidden />
                    {t("errors.reload")}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <section aria-labelledby={`${baseId}-basics`} className="flex flex-col gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 id={`${baseId}-basics`} className="text-lg font-semibold">
              {t("basics.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("basics.description")}</p>
          </div>
          <BilingualFields control={control} base="title" idBase={`${baseId}-title`} labels={{ ar: t("fields.titleAr"), en: t("fields.titleEn") }} />
          {withSlug && <SlugField control={control} id={`${baseId}-slug`} onTyped={() => (slugTyped.current = true)} />}
          <BilingualFields
            control={control}
            base="summary"
            idBase={`${baseId}-summary`}
            labels={{ ar: t("fields.summaryAr"), en: t("fields.summaryEn") }}
            hint={t("fields.summaryHint")}
            multiline
            rows={2}
          />
          <BilingualFields
            control={control}
            base="description"
            idBase={`${baseId}-description`}
            labels={{ ar: t("fields.descriptionAr"), en: t("fields.descriptionEn") }}
            hint={t("fields.descriptionHint")}
            multiline
            rows={5}
          />
          <CategoryPicker control={control} id={`${baseId}-category`} />
          <IconPicker control={control} id={`${baseId}-icon`} />
        </section>

        <section aria-labelledby={`${baseId}-steps`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={`${baseId}-steps`} className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
              {t("steps.title")}
              <span className="text-sm font-normal text-muted-foreground">{t("steps.count", { count: stepCount })}</span>
            </h2>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("steps.description")}</p>
          </div>
          <ol className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <StepCard
                key={field.fieldKey}
                control={control}
                setValue={setValue}
                index={index}
                total={stepCount}
                idBase={`${baseId}-s${index}`}
                open={open.has(field.key)}
                usage={field.id ? (protocol?.stepUsage[field.id] ?? NO_USAGE) : NO_USAGE}
                bind={{
                  toggle: setControl(field.key, "toggle"),
                  up: setControl(field.key, "up"),
                  down: setControl(field.key, "down"),
                  remove: setControl(field.key, "remove"),
                }}
                onToggle={() => toggle(field.key)}
                onMove={(d) => moveStep(index, d)}
                onRemove={() => removeStep(index)}
                onRemoveBlocked={blockedRemove}
              />
            ))}
          </ol>
          {removed.length > 0 && <RemovedSteps removed={removed} onUndo={undoRemove} />}
          <div className="flex flex-col items-start gap-1.5">
            <Button ref={addRef} type="button" variant="outline" className="h-9" onClick={addStep} disabled={atLimit} aria-describedby={atLimit ? `${baseId}-limit` : undefined}>
              <PlusIcon aria-hidden />
              {t("steps.add")}
            </Button>
            {atLimit && (
              <p id={`${baseId}-limit`} className="text-xs text-muted-foreground">
                {t("steps.limit", { max: String(MAX_STEPS_PER_PROTOCOL) })}
              </p>
            )}
          </div>
        </section>

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:-mx-6 md:px-6 lg:mx-0 lg:rounded-xl lg:border lg:px-4 print:hidden">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {isCreate ? t("saveBar.newDraft") : isDirty ? t("saveBar.unsaved") : protocol.isPublished ? t("saveBar.live") : t("saveBar.saved")}
          </p>
          <Button type="submit" disabled={isSubmitting || (!isCreate && !isDirty)} className="h-9 min-w-32">
            {saving ? <Spinner aria-hidden /> : <SaveIcon aria-hidden />}
            {isCreate ? (saving ? t("actions.creating") : t("actions.create")) : saving ? t("actions.saving") : t("actions.save")}
          </Button>
        </div>
      </form>

      <div className={protocol ? "flex flex-col gap-4 lg:col-start-2 lg:row-start-2" : "flex flex-col gap-4 lg:col-start-2 lg:row-start-1"}>
        {protocol && <UsagePanel kind={kind} protocol={protocol} />}
        <HowChangesWork />
      </div>
      <UnsavedChangesDialog guard={guard} />
      <WordingDialog question={wording} />
    </div>
  );
}

/** Steps removed since the last save, each with its Undo (they are deleted only when the form is saved). */
function RemovedSteps({ removed, onUndo }: { removed: readonly RemovedStep[]; onUndo: (token: string) => void }) {
  const t = useTranslations("protocols.editor.steps");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
      <p className="text-sm font-medium">{t("removedTitle")}</p>
      <ul className="flex flex-col gap-2">
        {removed.map((r) => {
          const primary = (locale === "en" ? r.values.textEn : r.values.textAr).trim();
          const secondary = (locale === "en" ? r.values.textAr : r.values.textEn).trim();
          const text = (primary || secondary).slice(0, 160);
          const lang = primary ? locale : secondary ? (locale === "en" ? "ar" : "en") : undefined;
          return (
            <li key={r.token} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm">
              <span className="min-w-0 flex-1 text-muted-foreground">
                {t("removedRow", { number: String(r.number) })}
                {text && (
                  <>
                    {" "}
                    <bdi lang={lang} className={lang === "ar" ? ARABIC_TEXT : undefined}>
                      «{text}»
                    </bdi>
                  </>
                )}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => onUndo(r.token)} aria-label={t("undoLabel", { number: String(r.number) })}>
                <Undo2Icon aria-hidden className="rtl:-scale-x-100" />
                {t("undo")}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SlugField({ control, id, onTyped }: { control: Control<EditorValues>; id: string; onTyped: () => void }) {
  const t = useTranslations("protocols.editor.fields");
  return (
    <Controller
      control={control}
      name="slug"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} data-field="slug">
          <FieldLabel htmlFor={id}>{t("slug")}</FieldLabel>
          <InputGroup dir="ltr">
            <InputGroupAddon>
              <InputGroupText>/protocols/</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id={id}
              name={field.name}
              ref={field.ref}
              value={field.value}
              onBlur={field.onBlur}
              onChange={(e) => {
                onTyped();
                field.onChange(e.target.value.toLowerCase());
              }}
              autoComplete="off"
              spellCheck={false}
              lang="en"
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={[`${id}-hint`, fieldState.invalid ? `${id}-error` : null].filter(Boolean).join(" ")}
            />
          </InputGroup>
          <FieldDescription id={`${id}-hint`}>{t("slugHint")}</FieldDescription>
          {fieldState.invalid && <EditorFieldError id={`${id}-error`} message={fieldState.error?.message} />}
        </Field>
      )}
    />
  );
}
