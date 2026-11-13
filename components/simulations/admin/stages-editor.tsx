"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, CircleAlertIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { type Control, Controller, get, useFieldArray, useFormState, type UseFormReturn, useWatch } from "react-hook-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { emptyOption, emptyStage, LIMITS, type ScenarioFormValues } from "@/lib/simulations/admin/content";
import type { ProtocolOption } from "@/lib/simulations/admin/queries";
import { cn } from "@/lib/utils";
import { BilingualFields, fieldId } from "./form-fields";

type Steps = ProtocolOption["steps"];
type Form = UseFormReturn<ScenarioFormValues>;
const NONE = "none";

/** The text of an array-level error (zodResolver puts it on `.root` of a field array, else on the path itself). */
function arrayError(errors: unknown, path: string): string | undefined {
  const value = get(errors, path) as { root?: { message?: string }; message?: string } | undefined;
  return value?.root?.message ?? value?.message;
}

/** A pending focus move after a reorder or a removal, applied once the list re-rendered. */
type FocusRequest = { selector: string; fallback?: string } | null;

function useFocusAfterRender(deps: unknown) {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<FocusRequest>(null);
  useEffect(() => {
    const r = requestRef.current;
    if (!r || !containerRef.current) return;
    requestRef.current = null;
    const pick = (selector: string) => containerRef.current?.querySelector<HTMLElement>(selector) ?? null;
    let target = pick(r.selector);
    if (!target || target.hasAttribute("disabled")) target = r.fallback ? pick(r.fallback) : null;
    target?.focus();
  }, [deps]);
  return { containerRef, requestRef };
}

/** Moves the entry at `from` to `to`, like react-hook-form's move (the others shift). */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * The ordered stages of a scenario, each with its ordered options. Reordering uses Move up / Move down buttons (no
 * drag and drop, so it works with a keyboard and a screen reader); focus follows the moved item and a polite live
 * region says where it went. Removing a stage asks first. A new stage or option takes focus at its first field and is
 * announced (UX-6).
 *
 * Long scenarios (more than two stages) open with every stage collapsed to a one-line summary, with "expand all /
 * collapse all", so the editor is not one very long page (UX-13). Collapsed fields stay mounted (keepMounted: their
 * values and validation stay in the form) and a stage with an error opens by itself, so the first invalid field can
 * take focus. The state is kept per position (react-hook-form gives the rows new ids after each save).
 */
export function StagesEditor({ form, steps }: { form: Form; steps: Steps }) {
  const t = useTranslations("simulations.admin.editor");
  const format = useFormatter();
  const n = (value: number) => format.number(value, "integer");
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "stages" });
  const [announcement, setAnnouncement] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<boolean[]>(() => fields.map(() => fields.length > 2));
  const { containerRef, requestRef } = useFocusAfterRender(fields);

  // A stage with an error opens when the error appears (a failed save, a server-side issue), before react-hook-form's
  // second focus try and the editor's fallback move focus to its first problem. It never closes by itself.
  useEffect(
    () =>
      form.subscribe({
        formState: { errors: true },
        callback: ({ errors }) => {
          const stageErrors = errors?.stages as unknown as Record<number, unknown> | undefined;
          if (!stageErrors) return;
          setCollapsed((prev) => (prev.some((c, i) => c && stageErrors[i]) ? prev.map((c, i) => c && !stageErrors[i]) : prev));
        },
      }),
    [form],
  );

  function setStageOpen(index: number, open: boolean) {
    setCollapsed((prev) => {
      const next = fields.map((_, i) => prev[i] ?? false);
      next[index] = !open;
      return next;
    });
  }

  function moveStage(from: number, to: number) {
    move(from, to);
    setCollapsed((prev) => moved(fields.map((_, i) => prev[i] ?? false), from, to));
    const dir = to < from ? "up" : "down";
    requestRef.current = { selector: `[data-move="stage-${to}-${dir}"]`, fallback: `[data-move="stage-${to}-${dir === "up" ? "down" : "up"}"]` };
    setAnnouncement(t("movedStage", { n: n(to + 1), total: n(fields.length) }));
  }

  function addStage() {
    const index = fields.length;
    setCollapsed((prev) => [...fields.map((_, i) => prev[i] ?? false), false]);
    // react-hook-form focuses the field whose full path starts with focusName (a bare "contextAr" matched nothing).
    append(emptyStage(), { focusName: `stages.${index}.contextAr` });
    setAnnouncement(t("addedStage", { n: n(index + 1) }));
  }

  function confirmRemove() {
    if (removing === null) return;
    const index = removing;
    setRemoving(null);
    remove(index);
    setCollapsed((prev) => fields.map((_, i) => prev[i] ?? false).filter((_, i) => i !== index));
    const next = Math.min(index, fields.length - 2);
    requestRef.current = next >= 0 ? { selector: `[data-stage-heading="${next}"]` } : { selector: "[data-add-stage]" };
    setAnnouncement(t("removedStage"));
  }

  const anyCollapsed = fields.some((_, i) => collapsed[i]);
  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {fields.length > 1 && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setCollapsed(fields.map(() => !anyCollapsed))}>
            {anyCollapsed ? <ChevronsUpDownIcon aria-hidden /> : <ChevronsDownUpIcon aria-hidden />}
            {anyCollapsed ? t("expandAll") : t("collapseAll")}
          </Button>
        </div>
      )}
      {fields.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("noStages")}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {fields.map((field, index) => (
            <li key={field.id}>
              <StageCard
                form={form}
                index={index}
                total={fields.length}
                steps={steps}
                open={!collapsed[index]}
                onOpenChange={(open) => setStageOpen(index, open)}
                onMove={moveStage}
                onRemove={() => setRemoving(index)}
                announce={setAnnouncement}
              />
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          data-add-stage=""
          disabled={fields.length >= LIMITS.maxStages}
          onClick={addStage}
        >
          <PlusIcon aria-hidden />
          {t("addStage")}
        </Button>
        {fields.length >= LIMITS.maxStages && <p className="text-sm text-muted-foreground">{t("maxStages", { max: n(LIMITS.maxStages) })}</p>}
      </div>

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeStageTitle", { n: n((removing ?? 0) + 1) })}</AlertDialogTitle>
            <AlertDialogDescription>{t("removeStageDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <RemoveCancel />
            <AlertDialogAction type="button" variant="destructive" onClick={confirmRemove}>
              {t("removeStage", { n: n((removing ?? 0) + 1) })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RemoveCancel() {
  const tc = useTranslations("common.actions");
  return <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>;
}

function MoveButtons({
  kind,
  index,
  total,
  labels,
  onMove,
}: {
  kind: "stage" | "option";
  index: number;
  total: number;
  labels: { up: string; down: string };
  onMove: (from: number, to: number) => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={labels.up}
        data-move={`${kind}-${index}-up`}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        <ArrowUpIcon aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={labels.down}
        data-move={`${kind}-${index}-down`}
        disabled={index === total - 1}
        onClick={() => onMove(index, index + 1)}
      >
        <ArrowDownIcon aria-hidden />
      </Button>
    </>
  );
}

function StageCard({
  form,
  index,
  total,
  steps,
  open,
  onOpenChange,
  onMove,
  onRemove,
  announce,
}: {
  form: Form;
  index: number;
  total: number;
  steps: Steps;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  announce: (text: string) => void;
}) {
  const t = useTranslations("simulations.admin.editor");
  const tf = useTranslations("simulations.admin.fields");
  const format = useFormatter();
  const n = (value: number) => format.number(value, "integer");
  const uid = useId();
  const base = `stages.${index}` as const;
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: `${base}.options` });
  const kind = useWatch({ control: form.control, name: `${base}.kind` });
  const { errors } = useFormState({ control: form.control, name: `${base}.options` });
  const optionsError = arrayError(errors, `${base}.options`);
  const { containerRef, requestRef } = useFocusAfterRender(fields);
  const headingId = `${uid}-heading`;
  const label = t("stage", { n: n(index + 1) });

  function moveOption(from: number, to: number) {
    move(from, to);
    const dir = to < from ? "up" : "down";
    requestRef.current = { selector: `[data-move="option-${to}-${dir}"]`, fallback: `[data-move="option-${to}-${dir === "up" ? "down" : "up"}"]` };
    announce(t("movedOption", { n: n(to + 1), total: n(fields.length) }));
  }

  function removeOption(j: number) {
    remove(j);
    requestRef.current = { selector: "[data-add-option]" };
    announce(t("removedOption"));
  }

  function addOption() {
    const j = fields.length;
    append(emptyOption(), { focusName: `${base}.options.${j}.textAr` });
    announce(t("addedOption", { n: n(j + 1) }));
  }

  /** "Correct" in a one-answer stage works like a radio button: marking one unmarks the others. */
  function markCorrect(j: number, checked: boolean) {
    const options = form.getValues(`${base}.options`);
    options.forEach((_, k) => {
      if (k === j) {
        form.setValue(`${base}.options.${k}.isCorrect`, checked, { shouldDirty: true });
        if (checked) form.setValue(`${base}.options.${k}.isCritical`, false, { shouldDirty: true });
      } else if (checked && form.getValues(`${base}.kind`) === "single" && options[k].isCorrect) {
        form.setValue(`${base}.options.${k}.isCorrect`, false, { shouldDirty: true });
      }
    });
    if (form.formState.isSubmitted) void form.trigger(`${base}.options`);
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      render={<section role="group" aria-labelledby={headingId} />}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="text-base font-semibold">
            <CollapsibleTrigger
              data-stage-heading={index}
              className="group/trigger -ms-1 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronDownIcon aria-hidden className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/trigger:rotate-180" />
              {label}
            </CollapsibleTrigger>
          </h3>
          {!open && <StageSummary form={form} index={index} />}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <MoveButtons
            kind="stage"
            index={index}
            total={total}
            labels={{ up: t("moveStageUp", { n: n(index + 1) }), down: t("moveStageDown", { n: n(index + 1) }) }}
            onMove={onMove}
          />
          <Button type="button" variant="ghost" size="icon" aria-label={t("removeStage", { n: n(index + 1) })} onClick={onRemove}>
            <Trash2Icon aria-hidden className="text-destructive" />
          </Button>
        </div>
      </div>

      <CollapsibleContent keepMounted className="flex flex-col gap-4">
        <Controller
          name={`${base}.kind`}
          control={form.control}
          render={({ field }) => (
            <div className="flex flex-col gap-2">
              <p id={`${uid}-kind`} className="text-sm font-medium">
                {tf("kind")}
              </p>
              <RadioGroup
                aria-labelledby={`${uid}-kind`}
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value === "multi" ? "multi" : "single");
                  if (form.formState.isSubmitted) void form.trigger(`${base}.options`);
                }}
                className="flex flex-col gap-2 sm:flex-row sm:gap-6"
              >
                {(["single", "multi"] as const).map((value) => (
                  <Field key={value} orientation="horizontal" className="w-auto items-center gap-2">
                    {/* Explicit names: Base UI links a sibling label only after hydration (axe ran before it). */}
                    <RadioGroupItem value={value} id={`${uid}-kind-${value}`} aria-labelledby={`${uid}-kind-${value}-label`} />
                    <FieldLabel id={`${uid}-kind-${value}-label`} htmlFor={`${uid}-kind-${value}`} className="font-normal">
                      {value === "single" ? tf("kindSingle") : tf("kindMulti")}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            </div>
          )}
        />

        <BilingualFields
          control={form.control}
          base={`${base}.context`}
          labels={{ ar: tf("contextAr"), en: tf("contextEn") }}
          multiline
          rows={2}
          maxLength={LIMITS.context}
        />
        <BilingualFields
          control={form.control}
          base={`${base}.prompt`}
          labels={{ ar: tf("promptAr"), en: tf("promptEn") }}
          multiline
          rows={2}
          maxLength={LIMITS.prompt}
        />

        <div ref={containerRef} className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">{t("options")}</h4>
          {optionsError && (
            <p
              role="alert"
              tabIndex={-1}
              data-error-anchor=""
              className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive outline-none focus-visible:ring-3 focus-visible:ring-destructive/30"
            >
              <CircleAlertIcon aria-hidden className="size-4 shrink-0" />
              {optionsError}
            </p>
          )}
          <ol className="flex flex-col gap-3">
            {fields.map((field, j) => (
              <li key={field.id}>
                <OptionCard
                  form={form}
                  stage={index}
                  index={j}
                  total={fields.length}
                  kind={kind}
                  steps={steps}
                  onMove={moveOption}
                  onRemove={() => removeOption(j)}
                  onMarkCorrect={(checked) => markCorrect(j, checked)}
                />
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              data-add-option=""
              disabled={fields.length >= LIMITS.maxOptions}
              onClick={addOption}
            >
              <PlusIcon aria-hidden />
              {t("addOption")}
            </Button>
            {fields.length >= LIMITS.maxOptions && <p className="text-xs text-muted-foreground">{t("maxOptions", { max: n(LIMITS.maxOptions) })}</p>}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** One line under a collapsed stage: its answer type, options, correct ones, the start of its question, and problems. */
function StageSummary({ form, index }: { form: Form; index: number }) {
  const t = useTranslations("simulations.admin.editor");
  const tf = useTranslations("simulations.admin.fields");
  const format = useFormatter();
  const locale = useLocale();
  const stage = useWatch({ control: form.control, name: `stages.${index}` });
  const { errors } = useFormState({ control: form.control, name: `stages.${index}` });
  const invalid = Boolean(get(errors, `stages.${index}`));
  const options = stage?.options ?? [];
  const correct = options.filter((o) => o.isCorrect).length;
  const prompt = ((locale === "ar" ? stage?.promptAr || stage?.promptEn : stage?.promptEn || stage?.promptAr) ?? "").trim();
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 ps-6 text-xs text-muted-foreground">
      <span>{stage?.kind === "multi" ? tf("kindMulti") : tf("kindSingle")}</span>
      <span aria-hidden>·</span>
      <span>{t("summaryOptions", { count: options.length, n: format.number(options.length, "integer") })}</span>
      <span aria-hidden>·</span>
      <span>{t("summaryCorrect", { count: correct, n: format.number(correct, "integer") })}</span>
      {invalid && (
        <span className="inline-flex items-center gap-1 font-medium text-destructive">
          <CircleAlertIcon aria-hidden className="size-3.5" />
          {t("summaryInvalid")}
        </span>
      )}
      <span className="basis-full truncate text-sm text-foreground">{prompt || t("summaryNoPrompt")}</span>
    </p>
  );
}

function OptionCard({
  form,
  stage,
  index,
  total,
  kind,
  steps,
  onMove,
  onRemove,
  onMarkCorrect,
}: {
  form: Form;
  stage: number;
  index: number;
  total: number;
  kind: "single" | "multi";
  steps: Steps;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  onMarkCorrect: (checked: boolean) => void;
}) {
  const t = useTranslations("simulations.admin.editor");
  const tf = useTranslations("simulations.admin.fields");
  const format = useFormatter();
  const n = (value: number) => format.number(value, "integer");
  const uid = useId();
  const base = `stages.${stage}.options.${index}` as const;
  const isCorrect = useWatch({ control: form.control, name: `${base}.isCorrect` });
  const headingId = `${uid}-heading`;

  return (
    <section
      role="group"
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-4 rounded-lg border p-3 sm:p-4", isCorrect ? "border-success/40 bg-success/5" : "bg-background")}
    >
      <div className="flex items-center justify-between gap-2">
        <h5 id={headingId} className="text-sm font-semibold">
          {t("option", { n: n(index + 1) })}
        </h5>
        <div className="flex items-center gap-1">
          <MoveButtons
            kind="option"
            index={index}
            total={total}
            labels={{ up: t("moveOptionUp", { n: n(index + 1) }), down: t("moveOptionDown", { n: n(index + 1) }) }}
            onMove={onMove}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("removeOption", { n: n(index + 1) })}
            disabled={total <= LIMITS.minOptions}
            onClick={onRemove}
          >
            <Trash2Icon aria-hidden className="text-destructive" />
          </Button>
        </div>
      </div>
      <BilingualFields
        control={form.control}
        base={`${base}.text`}
        labels={{ ar: tf("optionTextAr"), en: tf("optionTextEn") }}
        multiline
        rows={2}
        maxLength={LIMITS.optionText}
      />
      <BilingualFields
        control={form.control}
        base={`${base}.feedback`}
        labels={{ ar: tf("feedbackAr"), en: tf("feedbackEn") }}
        description={tf("feedbackHint")}
        multiline
        rows={3}
        maxLength={LIMITS.feedback}
      />
      <div className="grid gap-4 md:grid-cols-[auto_auto_1fr] md:items-start">
        <Controller
          name={`${base}.isCorrect`}
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal" className="w-auto items-center gap-2 md:pt-6">
              <Checkbox
                id={fieldId(field.name)}
                ref={field.ref}
                checked={field.value}
                aria-labelledby={`${fieldId(field.name)}-label`}
                onCheckedChange={(checked) => onMarkCorrect(checked === true)}
              />
              <FieldLabel id={`${fieldId(field.name)}-label`} htmlFor={fieldId(field.name)} className="font-normal">
                {tf("correct")}
                {kind === "single" && <span className="sr-only"> ({tf("kindSingle")})</span>}
              </FieldLabel>
            </Field>
          )}
        />
        <Controller
          name={`${base}.isCritical`}
          control={form.control}
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid || undefined} className="w-auto items-start gap-2 md:pt-6">
              <Checkbox
                id={fieldId(field.name)}
                ref={field.ref}
                checked={field.value}
                disabled={isCorrect}
                aria-labelledby={`${fieldId(field.name)}-label`}
                aria-describedby={`${fieldId(field.name)}-hint`}
                aria-invalid={fieldState.invalid || undefined}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              <FieldContent>
                <FieldLabel id={`${fieldId(field.name)}-label`} htmlFor={fieldId(field.name)} className="font-normal">
                  {tf("critical")}
                </FieldLabel>
                <FieldDescription id={`${fieldId(field.name)}-hint`} className="text-xs">
                  {tf("criticalHint")}
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </FieldContent>
            </Field>
          )}
        />
        <StepSelect control={form.control} name={`${base}.stepId`} steps={steps} />
      </div>
    </section>
  );
}

function StepSelect({ control, name, steps }: { control: Control<ScenarioFormValues>; name: `stages.${number}.options.${number}.stepId`; steps: Steps }) {
  const tf = useTranslations("simulations.admin.fields");
  const format = useFormatter();
  const id = fieldId(name);
  const items = [
    { value: NONE, label: tf("stepNone") },
    ...steps.map((s) => ({
      value: s.id,
      label: `${format.number(s.order, "integer")}. ${s.text}${s.isCritical ? ` (${tf("stepCritical")})` : ""}`,
    })),
  ];
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined} className="min-w-0">
          <FieldLabel htmlFor={id}>{tf("step")}</FieldLabel>
          <Select
            items={items}
            value={field.value ?? NONE}
            onValueChange={(next) => field.onChange(typeof next === "string" && next !== NONE ? next : null)}
          >
            <SelectTrigger
              id={id}
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={`${id}-hint`}
              className="w-full min-w-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id={`${id}-hint`} className="text-xs">
            {tf("stepHint")}
          </FieldDescription>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
