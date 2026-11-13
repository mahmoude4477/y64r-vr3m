"use client";

import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** A stable DOM id for a form path ("stages.0.promptAr" -> "f-stages-0-promptAr"). */
export function fieldId(name: string): string {
  return `f-${name.replace(/\./g, "-")}`;
}

/**
 * One text field bound to react-hook-form (Field + FieldLabel + FieldError, CONVENTIONS 9). Arabic fields are RTL and
 * English ones LTR whatever the page language, with the matching `lang`, so screen readers and spell checkers read
 * them right.
 */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  lang,
  multiline = false,
  rows = 3,
  maxLength,
  className,
  inputClassName,
  describedBy,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  /** The id of a hint rendered elsewhere (e.g. one hint under a bilingual pair). */
  describedBy?: string;
  lang?: "ar" | "en";
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
}) {
  const id = fieldId(name);
  const descriptionId = description ? `${id}-hint` : describedBy;
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const common = {
          id,
          name: field.name,
          value: (field.value as string | undefined) ?? "",
          onChange: field.onChange,
          onBlur: field.onBlur,
          ref: field.ref,
          lang,
          dir: lang ? (lang === "ar" ? "rtl" : "ltr") : undefined,
          maxLength,
          "aria-invalid": fieldState.invalid || undefined,
          "aria-describedby": descriptionId,
          className: inputClassName,
        } as const;
        return (
          <Field data-invalid={fieldState.invalid || undefined} className={className}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {multiline ? <Textarea rows={rows} {...common} /> : <Input {...common} />}
            {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        );
      }}
    />
  );
}

/** An Arabic + English pair of the same field, side by side from the small breakpoint. */
export function BilingualFields<T extends FieldValues>({
  control,
  base,
  labels,
  description,
  multiline,
  rows,
  maxLength,
}: {
  control: Control<T>;
  /** The path without the language suffix ("titleAr" / "titleEn" -> "title"). */
  base: string;
  labels: { ar: string; en: string };
  description?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
}) {
  // One hint under the pair, read with both fields.
  const hintId = description ? `${fieldId(base)}-hint` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name={`${base}Ar` as FieldPath<T>}
          label={labels.ar}
          describedBy={hintId}
          lang="ar"
          multiline={multiline}
          rows={rows}
          maxLength={maxLength}
        />
        <TextField
          control={control}
          name={`${base}En` as FieldPath<T>}
          label={labels.en}
          describedBy={hintId}
          lang="en"
          multiline={multiline}
          rows={rows}
          maxLength={maxLength}
        />
      </div>
      {description && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
