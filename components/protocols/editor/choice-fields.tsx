"use client";

import { useTranslations } from "next-intl";
import { type Control, Controller, type FieldPath } from "react-hook-form";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { EDITOR_ICONS, type EditorValues } from "@/lib/protocols/editor-form";
import { MAX_STEP_WEIGHT, MIN_STEP_WEIGHT, PROTOCOL_CATEGORIES } from "@/lib/validation/protocol";
import { cn } from "@/lib/utils";
import { EditorFieldError } from "./text-field";

// Radio groups and switches of the protocol editor. Each radio is a tile whose whole surface is its label (tap target
// >= 36 px); the focus ring is drawn on the tile. Color is never the only signal: checked tiles also get a border.

const tile =
  "relative flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm transition-colors select-none hover:bg-muted has-data-checked:border-primary has-data-checked:bg-primary/8 has-data-checked:font-medium has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60 has-data-disabled:hover:bg-background dark:bg-input/30 dark:has-data-checked:bg-primary/15";

/** Message key of each bundled icon (protocols.editor.icons.*). */
const ICON_LABEL: Record<string, "syringe" | "trash" | "droplets" | "cleaning" | "hand" | "flask" | "food" | "wrench" | "book"> = {
  syringe: "syringe",
  "trash-2": "trash",
  droplets: "droplets",
  "brush-cleaning": "cleaning",
  hand: "hand",
  "flask-conical": "flask",
  "utensils-crossed": "food",
  wrench: "wrench",
  "book-open-check": "book",
};

export function CategoryPicker({ control, id }: { control: Control<EditorValues>; id: string }) {
  const t = useTranslations("protocols.editor.fields");
  const tc = useTranslations("common.category");
  return (
    <Controller
      control={control}
      name="category"
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid} data-field="category" className="gap-2">
          <FieldLegend id={`${id}-legend`} variant="label">
            {t("category")}
          </FieldLegend>
          <RadioGroup
            value={field.value || null}
            onValueChange={(v) => field.onChange(v)}
            aria-labelledby={`${id}-legend`}
            aria-describedby={fieldState.invalid ? `${id}-error` : undefined}
            aria-invalid={fieldState.invalid || undefined}
            className="flex flex-wrap gap-2"
          >
            {PROTOCOL_CATEGORIES.map((c) => (
              <label key={c} htmlFor={`${id}-${c}`} className={cn(tile, "h-9")}>
                <RadioGroupItem id={`${id}-${c}`} value={c} />
                {tc(c)}
              </label>
            ))}
          </RadioGroup>
          {fieldState.invalid && <EditorFieldError id={`${id}-error`} message={fieldState.error?.message} />}
        </FieldSet>
      )}
    />
  );
}

export function IconPicker({ control, id }: { control: Control<EditorValues>; id: string }) {
  const t = useTranslations("protocols.editor");
  return (
    <Controller
      control={control}
      name="icon"
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid} data-field="icon" className="gap-2">
          <FieldLegend id={`${id}-legend`} variant="label">
            {t("fields.icon")}
          </FieldLegend>
          <RadioGroup
            value={EDITOR_ICONS.includes(field.value) ? field.value : null}
            onValueChange={(v) => field.onChange(v)}
            aria-labelledby={`${id}-legend`}
            aria-describedby={fieldState.invalid ? `${id}-error` : undefined}
            aria-invalid={fieldState.invalid || undefined}
            className="flex flex-wrap gap-2"
          >
            {EDITOR_ICONS.map((name) => {
              const label = ICON_LABEL[name] ? t(`icons.${ICON_LABEL[name]}`) : name;
              return (
                <label key={name} htmlFor={`${id}-${name}`} title={label} className={cn(tile, "size-11 justify-center px-0")}>
                  <RadioGroupItem id={`${id}-${name}`} value={name} className="absolute inset-0 z-10 size-full rounded-lg opacity-0" />
                  <ProtocolIcon name={name} className="size-5" />
                  <span className="sr-only">{label}</span>
                </label>
              );
            })}
          </RadioGroup>
          {fieldState.invalid && <EditorFieldError id={`${id}-error`} message={fieldState.error?.message} />}
        </FieldSet>
      )}
    />
  );
}

/** The weight radios. `disabled`: the step has results, so its weight stays as it is (lib/protocols/history.ts). */
export function WeightPicker({
  control,
  name,
  id,
  disabled = false,
}: {
  control: Control<EditorValues>;
  name: FieldPath<EditorValues>;
  id: string;
  disabled?: boolean;
}) {
  const t = useTranslations("protocols.editor.steps.fields");
  const weights = Array.from({ length: MAX_STEP_WEIGHT - MIN_STEP_WEIGHT + 1 }, (_, i) => MIN_STEP_WEIGHT + i);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldSet data-invalid={fieldState.invalid} data-field={name} data-disabled={disabled || undefined} className="gap-2">
          <FieldLegend id={`${id}-legend`} variant="label">
            {t("weight")}
          </FieldLegend>
          <FieldDescription id={`${id}-hint`}>{t("weightHint")}</FieldDescription>
          <RadioGroup
            value={String(field.value)}
            onValueChange={(v) => field.onChange(Number(v))}
            disabled={disabled}
            aria-labelledby={`${id}-legend`}
            aria-describedby={[`${id}-hint`, fieldState.invalid ? `${id}-error` : null].filter(Boolean).join(" ")}
            className="grid max-w-md grid-cols-3 gap-2"
          >
            {weights.map((w) => (
              <label key={w} htmlFor={`${id}-${w}`} className={cn(tile, "min-h-11 py-1.5")}>
                <RadioGroupItem id={`${id}-${w}`} value={String(w)} />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="font-semibold tabular-nums">{w}</span>
                  <span className="truncate text-xs text-muted-foreground">{t(`weight${w}` as "weight1" | "weight2" | "weight3")}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {fieldState.invalid && <EditorFieldError id={`${id}-error`} message={fieldState.error?.message} />}
        </FieldSet>
      )}
    />
  );
}

/** A labelled switch with its explanation (the label and the hint name and describe the control). */
export function SwitchField({
  id,
  name,
  checked,
  disabled,
  onCheckedChange,
  label,
  hint,
  error,
}: {
  id: string;
  name: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  hint: string;
  /** A server error for this switch (a stale page that changed a fixed value). */
  error?: string;
}) {
  return (
    <Field orientation="horizontal" data-field={name} data-disabled={disabled || undefined} data-invalid={!!error || undefined} className="items-start gap-3">
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v)}
        aria-describedby={[`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
        aria-invalid={!!error || undefined}
        className="mt-0.5"
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
        <EditorFieldError id={`${id}-error`} message={error} />
      </FieldContent>
    </Field>
  );
}
