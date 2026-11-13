"use client";

import { PrinterIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog; the page has a print layout (chrome hidden, steps kept whole). */
export function PrintButton() {
  const t = useTranslations("common.actions");
  return (
    <Button type="button" variant="outline" className="h-9" onClick={() => window.print()}>
      <PrinterIcon aria-hidden />
      {t("print")}
    </Button>
  );
}
