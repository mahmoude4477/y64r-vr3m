"use client";

import { PrinterIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  const t = useTranslations("common.actions");
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <PrinterIcon aria-hidden />
      {t("print")}
    </Button>
  );
}
