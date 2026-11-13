"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { NotebookPenIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { saveScanNotesAction } from "@/lib/scans/actions";
import { callAction, reviewErrorKey } from "@/lib/scans/client/review-errors";
import { SCAN_NOTES_MAX } from "@/lib/scans/constants";
import { type ScanNotesFormValues, scanNotesFormSchema } from "@/lib/scans/schemas";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { useRegisterNotesFlush } from "./review-notes-context";

/**
 * The examiner's notes on the whole scan (Scan.notes), shown in the report. The browser asks before leaving unsaved
 * text, and finalising saves unsaved notes first (ReviewNotesContext).
 */
export function ScanNotesForm({ scanId, notes }: { scanId: string; notes: string | null }) {
  const t = useTranslations("scans.detail.notes");
  const ts = useTranslations("scans");
  const actions = useTranslations("common.actions");
  const locale = useLocale();
  const errorMap = useZodErrorMap();
  const [savedNotes, setSavedNotes] = useState(notes ?? "");
  const savedRef = useRef(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const registerFlush = useRegisterNotesFlush();
  const form = useForm<ScanNotesFormValues>({
    resolver: zodResolver(scanNotesFormSchema, { error: errorMap }),
    defaultValues: { notes: notes ?? "" },
  });
  const value = useWatch({ control: form.control, name: "notes" });
  const dirty = value.trim() !== savedNotes.trim();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function saveNotes(text: string): Promise<boolean> {
    setError(null);
    const res = await callAction(() => saveScanNotesAction(locale, { scanId, notes: text }));
    if (!res.ok) {
      setError(ts(reviewErrorKey(res.error)));
      return false;
    }
    savedRef.current = res.notes ?? "";
    setSavedNotes(savedRef.current);
    form.reset({ notes: savedRef.current });
    return true;
  }

  async function onSubmit(values: ScanNotesFormValues) {
    if (await saveNotes(values.notes)) toast.success(t("saved"));
  }

  // Finalising first saves notes typed but not saved yet (nothing to do when they did not change).
  const flush = useRef<() => Promise<boolean>>(async () => true);
  useEffect(() => {
    flush.current = async () => {
      const text = form.getValues("notes");
      if (text.trim() === savedRef.current.trim()) return true;
      if (!(await form.trigger("notes"))) return false;
      return saveNotes(text);
    };
  });
  useEffect(() => registerFlush?.(() => flush.current()), [registerFlush]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="flex items-center gap-2">
            <NotebookPenIcon aria-hidden className="size-4.5 text-primary" />
            {t("title")}
          </h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} noValidate className="flex flex-col gap-3">
          <Controller
            name="notes"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="scan-notes" className="sr-only">
                  {t("label")}
                </FieldLabel>
                <Textarea
                  id="scan-notes"
                  rows={4}
                  maxLength={SCAN_NOTES_MAX}
                  placeholder={t("placeholder")}
                  aria-invalid={fieldState.invalid}
                  aria-describedby="scan-notes-count"
                  {...field}
                />
                <FieldDescription id="scan-notes-count" className="flex justify-between gap-2 text-xs tabular-nums">
                  <span>{dirty ? t("unsaved") : null}</span>
                  <span>{t("count", { count: String(value.length), max: String(SCAN_NOTES_MAX) })}</span>
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" variant="outline" className="h-10 self-end" disabled={!dirty || form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Spinner aria-hidden />}
            {form.formState.isSubmitting ? actions("saving") : actions("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
