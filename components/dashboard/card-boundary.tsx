"use client";

import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { catchError, type ErrorInfo } from "next/error";
import { useTranslations } from "next-intl";
import { ReportCard } from "@/components/reports/report-card";
import { Button } from "@/components/ui/button";

/**
 * Error boundary around one dashboard card: when its query fails, that card says so and offers a retry (which
 * re-fetches the server data), and the rest of the dashboard stays usable. The server already logged the error
 * (instrumentation onRequestError); nothing about it is shown here.
 */
function DashboardCardError({ id, title }: { id: string; title: string }, { retry }: ErrorInfo) {
  const t = useTranslations("dashboard.error");
  return (
    <ReportCard id={id} title={title}>
      <div className="flex flex-col items-start gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
          {t("description")}
        </p>
        <Button variant="outline" onClick={() => retry()}>
          <RotateCwIcon aria-hidden />
          {t("retry")}
        </Button>
      </div>
    </ReportCard>
  );
}

export const CardBoundary = catchError(DashboardCardError);
