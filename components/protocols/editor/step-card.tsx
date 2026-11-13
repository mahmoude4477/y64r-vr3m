"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, CircleAlertIcon, LinkIcon, LockIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type Control, Controller, type UseFormSetValue, useFormState, useWatch } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EditorValues } from "@/lib/protocols/editor-form";
import type { StepUsageCounts } from "@/lib/protocols/editor-queries";
import { cn } from "@/lib/utils";
import { CriticalBadge, MandatoryBadge, VisualCheckBadge, WeightBadge } from "../protocol-badges";
import { SwitchField, WeightPicker } from "./choice-fields";
import { ARABIC_TEXT, BilingualFields, TextField } from "./text-field";

type Bind = (el: HTMLButtonElement | null) => void;
/** Callbacks that register the step's buttons, so the editor can move focus to them after a move or removal. */
export type StepButtonBinders = { toggle: Bind; up: Bind; down: Bind; remove: Bind };

/** Why a step cannot be removed: it has results, a scenario answer links to it, or it is the only step. */
export type RemoveBlock = "results" | "linked" | "last";

export const NO_USAGE: StepUsageCounts = { results: 0, options: 0 };

/**
 * One step of the editor: a summary row (number, text, badges, results it already has) with move up / move down /
 * remove buttons and a disclosure button that shows its fields. Closed steps render no fields (lighter on phones);
 * their values stay in the form. Steps with history cannot be removed (the button explains why), and a step with
 * results keeps its meaning: mandatory, critical, weight and photo check are read-only (lib/protocols/history.ts).
 */
export function StepCard({
  control,
  setValue,
  index,
  total,
  idBase,
  open,
  usage,
  bind: { toggle: bindToggle, up: bindUp, down: bindDown, remove: bindRemove },
  onToggle,
  onMove,
  onRemove,
  onRemoveBlocked,
}: {
  control: Control<EditorValues>;
  setValue: UseFormSetValue<EditorValues>;
  index: number;
  total: number;
  idBase: string;
  open: boolean;
  /** Results and scenario options that point at this step (none for new steps). */
  usage: StepUsageCounts;
  bind: StepButtonBinders;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onRemoveBlocked: (reason: RemoveBlock) => void;
}) {
  const t = useTranslations("protocols.editor.steps");
  const locale = useLocale();
  const step = useWatch({ control, name: `steps.${index}` });
  const { errors } = useFormState({ control, name: `steps.${index}` });
  const hasError = !!errors.steps?.[index];
  const number = index + 1;
  const hasResults = usage.results > 0;
  const locked = hasResults || usage.options > 0;
  const last = total <= 1;
  const primary = locale === "en" ? step?.textEn : step?.textAr;
  const secondary = locale === "en" ? step?.textAr : step?.textEn;
  const title = (primary?.trim() || secondary?.trim() || "").slice(0, 300);
  const titleLang = primary?.trim() ? locale : secondary?.trim() ? (locale === "en" ? "ar" : "en") : undefined;
  const panelId = `${idBase}-panel`;
  const lockId = `${idBase}-lock`;

  return (
    <li
      className={cn(
        "rounded-xl bg-card ring-1 ring-foreground/10",
        step?.isCritical && "border-s-4 border-destructive/70",
        hasError && "ring-2 ring-destructive/60",
      )}
    >
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3 sm:p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
              step?.isCritical ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
            )}
          >
            {number}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h3 className="text-sm leading-relaxed font-medium">
              <button
                ref={bindToggle}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={onToggle}
                className="group/toggle flex w-full min-h-8 items-start justify-between gap-2 rounded-md text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 text-pretty">
                  <span className="sr-only">{t("number", { number: String(number) })}: </span>
                  {title ? (
                    <bdi lang={titleLang} className={titleLang === "ar" ? ARABIC_TEXT : undefined}>
                      {title}
                    </bdi>
                  ) : (
                    <span className="text-muted-foreground">{t("untitled")}</span>
                  )}
                </span>
                <ChevronDownIcon
                  aria-hidden
                  className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")}
                />
              </button>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <MandatoryBadge mandatory={!!(step?.isMandatory || step?.isCritical)} />
              {step?.isCritical && <CriticalBadge />}
              {step?.visualCheck && <VisualCheckBadge />}
              <WeightBadge weight={step?.weight ?? 1} />
              {hasResults && (
                <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground ring-1 ring-border">
                  <LockIcon aria-hidden />
                  {t("usage", { count: usage.results })}
                </Badge>
              )}
              {usage.options > 0 && (
                <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground ring-1 ring-border">
                  <LinkIcon aria-hidden />
                  {t("linked", { count: usage.options })}
                </Badge>
              )}
              {hasError && (
                <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive ring-1 ring-destructive/25">
                  <CircleAlertIcon aria-hidden />
                  {t("needsAttention")}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          <Button
            ref={bindUp}
            type="button"
            variant="ghost"
            size="icon"
            disabled={index === 0}
            aria-label={t("moveUp", { number: String(number) })}
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon aria-hidden />
          </Button>
          <Button
            ref={bindDown}
            type="button"
            variant="ghost"
            size="icon"
            disabled={index === total - 1}
            aria-label={t("moveDown", { number: String(number) })}
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon aria-hidden />
          </Button>
          <Button
            ref={bindRemove}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("remove", { number: String(number) })}
            aria-disabled={locked || last || undefined}
            aria-describedby={locked ? lockId : undefined}
            className={cn("text-destructive hover:bg-destructive/10 hover:text-destructive", (locked || last) && "opacity-50")}
            onClick={() => (locked ? onRemoveBlocked(hasResults ? "results" : "linked") : last ? onRemoveBlocked("last") : onRemove())}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </div>
      </div>
      {locked && (
        <p id={lockId} className="sr-only">
          {hasResults ? `${t("lockedTitle")}. ${t("locked")}` : `${t("linkedTitle")}. ${t("linkedNote")}`}
        </p>
      )}
      <div id={panelId} hidden={!open} className="border-t p-3 sm:p-4">
        {open && <StepFields control={control} setValue={setValue} index={index} idBase={idBase} lock={hasResults ? "results" : locked ? "linked" : null} />}
      </div>
    </li>
  );
}

function StepFields({
  control,
  setValue,
  index,
  idBase,
  lock,
}: {
  control: Control<EditorValues>;
  setValue: UseFormSetValue<EditorValues>;
  index: number;
  idBase: string;
  /** results: removal and meaning locked; linked: removal locked only. */
  lock: "results" | "linked" | null;
}) {
  const t = useTranslations("protocols.editor.steps");
  const f = useTranslations("protocols.editor.steps.fields");
  const isCritical = useWatch({ control, name: `steps.${index}.isCritical` });
  const visualCheck = useWatch({ control, name: `steps.${index}.visualCheck` });
  const path = `steps.${index}` as const;
  const fixed = lock === "results";

  return (
    <div className="flex flex-col gap-5">
      {lock && (
        <div role="note" className="flex items-start gap-2.5 rounded-lg bg-muted/70 p-3 text-sm">
          {fixed ? (
            <LockIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <LinkIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <p className="leading-relaxed">
            <span className="font-medium">{fixed ? t("lockedTitle") : t("linkedTitle")}.</span> {fixed ? t("locked") : t("linkedNote")}
          </p>
        </div>
      )}
      <BilingualFields
        control={control}
        base={`${path}.text`}
        idBase={`${idBase}-text`}
        labels={{ ar: f("textAr"), en: f("textEn") }}
        hint={f("textHint")}
        multiline
        rows={2}
      />
      <BilingualFields
        control={control}
        base={`${path}.rationale`}
        idBase={`${idBase}-why`}
        labels={{ ar: f("rationaleAr"), en: f("rationaleEn") }}
        hint={f("rationaleHint")}
        multiline
        rows={3}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name={`${path}.isMandatory`}
          render={({ field, fieldState }) => (
            <SwitchField
              id={`${idBase}-mandatory`}
              name={field.name}
              checked={field.value || isCritical}
              disabled={isCritical || fixed}
              onCheckedChange={field.onChange}
              label={f("mandatory")}
              hint={isCritical ? f("mandatoryLocked") : f("mandatoryHint")}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name={`${path}.isCritical`}
          render={({ field, fieldState }) => (
            <SwitchField
              id={`${idBase}-critical`}
              name={field.name}
              checked={field.value}
              disabled={fixed}
              onCheckedChange={(v) => {
                field.onChange(v);
                if (v) setValue(`${path}.isMandatory`, true, { shouldDirty: true });
              }}
              label={f("critical")}
              hint={f("criticalHint")}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name={`${path}.visualCheck`}
          render={({ field, fieldState }) => (
            <SwitchField
              id={`${idBase}-visual`}
              name={field.name}
              checked={field.value}
              disabled={fixed}
              onCheckedChange={field.onChange}
              label={f("visual")}
              hint={f("visualHint")}
              error={fieldState.error?.message}
            />
          )}
        />
      </div>
      <WeightPicker control={control} name={`${path}.weight`} id={`${idBase}-weight`} disabled={fixed} />

      {visualCheck && (
        <BilingualFields
          control={control}
          base={`${path}.criteria`}
          idBase={`${idBase}-criteria`}
          labels={{ ar: f("criteriaAr"), en: f("criteriaEn") }}
          hint={f("criteriaHint")}
          multiline
          rows={2}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name={`${path}.referenceLabel`}
          id={`${idBase}-ref-label`}
          label={f("referenceLabel")}
          inputDir="auto"
          hint={f.rich("referenceLabelHint", {
            en: (chunks) => (
              <bdi lang="en" dir="ltr">
                {chunks}
              </bdi>
            ),
          })}
        />
        <TextField
          control={control}
          name={`${path}.referenceUrl`}
          id={`${idBase}-ref-url`}
          label={f("referenceUrl")}
          hint={f.rich("referenceUrlHint", {
            en: (chunks) => (
              <bdi lang="en" dir="ltr">
                {chunks}
              </bdi>
            ),
          })}
          inputDir="ltr"
          type="url"
        />
      </div>
    </div>
  );
}
