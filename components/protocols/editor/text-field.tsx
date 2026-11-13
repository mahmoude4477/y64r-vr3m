"use client";

import type { ReactNode } from "react";
import { type Control, Controller, type FieldPath } from "react-hook-form";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EditorValues } from "@/lib/protocols/editor-form";
import { cn } from "@/lib/utils";

type Lang = "ar" | "en";
const DIR: Record<Lang, "rtl" | "ltr"> = { ar: "rtl", en: "ltr" };

/**
 * Arabic content in any interface language: the Arabic typeface first. In the English interface the page font stack
 * starts with IBM Plex Sans and its local fallback (Arial, which has Arabic glyphs on Windows), so Arabic text would
 * otherwise never reach IBM Plex Sans Arabic.
 */
export const ARABIC_TEXT = "font-[family-name:var(--font-arabic)]";

/**
 * A field's error message, linked to its control through aria-describedby. Deliberately NOT a live region: a submit
 * with many errors would otherwise announce every one of them at once. The form's error summary (one role=alert) is
 * the announcement, and focus moves to the first invalid field.
 */
export function EditorFieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} data-slot="field-error" className="text-sm font-normal text-destructive">
      {message}
    </p>
  );
}

/**
 * One labelled text input or textarea bound to the editor form, with its hint and error wired to the control
 * (aria-describedby), and the language of the content it holds (lang / dir), whatever the page language is.
 * `data-field` = the form path, used to move focus to the first invalid field.
 */
export function TextField({
  control,
  name,
  id,
  label,
  hint,
  lang,
  multiline = false,
  rows,
  inputDir,
  describedById,
  type = "text",
  className,
}: {
  control: Control<EditorValues>;
  name: FieldPath<EditorValues>;
  id: string;
  label: string;
  hint?: ReactNode;
  /** A hint rendered elsewhere (shared by a pair of fields). */
  describedById?: string;
  /** "url" gives phones the address keyboard (the form has noValidate: the schema decides). */
  type?: "text" | "url";
  lang?: Lang;
  multiline?: boolean;
  rows?: number;
  /** Direction of the typed text when it is not one language: "ltr" for links, "auto" for mixed text (references). */
  inputDir?: "ltr" | "rtl" | "auto";
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const describedBy = [hintId, describedById, fieldState.invalid ? errorId : null].filter(Boolean).join(" ") || undefined;
        const common = {
          id,
          name: field.name,
          value: typeof field.value === "string" ? field.value : "",
          onChange: field.onChange,
          onBlur: field.onBlur,
          ref: field.ref,
          "aria-invalid": fieldState.invalid || undefined,
          "aria-describedby": describedBy,
          lang,
          dir: inputDir ?? (lang ? DIR[lang] : undefined),
          className: lang === "ar" ? ARABIC_TEXT : undefined,
        };
        return (
          <Field data-invalid={fieldState.invalid} data-field={name} className={cn("min-w-0", className)}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {multiline ? (
              <Textarea rows={rows ?? 3} {...common} />
            ) : (
              <Input type={type} inputMode={type === "url" ? "url" : undefined} autoComplete="off" spellCheck={type === "url" ? false : undefined} {...common} />
            )}
            {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
            {fieldState.invalid && <EditorFieldError id={errorId} message={fieldState.error?.message} />}
          </Field>
        );
      }}
    />
  );
}

/** An Arabic + English pair of the same field, side by side from the small-tablet width up. */
export function BilingualFields({
  control,
  base,
  idBase,
  labels,
  hint,
  multiline,
  rows,
}: {
  control: Control<EditorValues>;
  /** Path without the Ar / En suffix, e.g. "titleAr" -> "title", "steps.0.textAr" -> "steps.0.text". */
  base: string;
  idBase: string;
  labels: { ar: string; en: string };
  hint?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const hintId = hint ? `${idBase}-hint` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name={`${base}Ar` as FieldPath<EditorValues>}
          id={`${idBase}-ar`}
          label={labels.ar}
          describedById={hintId}
          lang="ar"
          multiline={multiline}
          rows={rows}
        />
        <TextField
          control={control}
          name={`${base}En` as FieldPath<EditorValues>}
          id={`${idBase}-en`}
          label={labels.en}
          describedById={hintId}
          lang="en"
          multiline={multiline}
          rows={rows}
        />
      </div>
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </div>
  );
}
