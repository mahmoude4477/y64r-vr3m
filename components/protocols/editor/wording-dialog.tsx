"use client";

import { useLocale, useTranslations } from "next-intl";
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
import type { EditorStepValues } from "@/lib/protocols/editor-form";
import { ARABIC_TEXT } from "./text-field";

/** A save waiting for the answer: the reworded steps (1-based, with their new values) and how to answer. */
export type WordingQuestion = { steps: Array<{ number: number; step: EditorStepValues | undefined }>; answer: (save: boolean) => void };

/**
 * "Save the new wording of steps that have results?": past scan reports and simulation results show each step's
 * current wording (lib/protocols/history.ts), so the editor confirms before it rewords such a step. Keep editing is the
 * safe default (first, so it gets the focus); closing the dialog answers it too.
 */
export function WordingDialog({ question }: { question: WordingQuestion | null }) {
  const t = useTranslations("protocols.editor");
  const locale = useLocale();
  return (
    <AlertDialog
      open={question !== null}
      onOpenChange={(open) => {
        if (!open) question?.answer(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("wording.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("wording.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex flex-col gap-1.5 text-sm">
          {question?.steps.map(({ number, step }) => {
            const primary = (locale === "en" ? step?.textEn : step?.textAr)?.trim() ?? "";
            const secondary = (locale === "en" ? step?.textAr : step?.textEn)?.trim() ?? "";
            const text = (primary || secondary).slice(0, 160);
            const lang = primary ? locale : secondary ? (locale === "en" ? "ar" : "en") : undefined;
            return (
              <li key={number} className="rounded-lg bg-muted/60 px-3 py-2 leading-relaxed">
                <span className="font-medium">{t("steps.number", { number: String(number) })}</span>
                {text && (
                  <>
                    {": "}
                    <bdi lang={lang} className={lang === "ar" ? ARABIC_TEXT : undefined}>
                      {text}
                    </bdi>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("wording.advice")}</p>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("wording.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => question?.answer(true)}>{t("wording.confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
