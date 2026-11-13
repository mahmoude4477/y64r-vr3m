"use client";

import { PrinterIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog (print or "save as PDF"); the app chrome and actions hide themselves in print. */
export function PrintButton() {
  const t = useTranslations("scans.detail.report");
  return (
    <Button variant="outline" className="h-10" onClick={() => window.print()}>
      <PrinterIcon aria-hidden />
      {t("print")}
    </Button>
  );
}
