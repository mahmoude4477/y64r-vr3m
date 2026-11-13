"use client";

import { CircleAlertIcon, CircleCheckIcon, CircleIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { ServiceOffAlert } from "@/components/shared/service-off-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import { aiGaveUp, isSharedStateKey, scanErrorKey } from "@/lib/scans/client/errors";
import type { PhotoSlot } from "@/lib/scans/client/photo-slots";
import { cn } from "@/lib/utils";
import { useScanErrorText } from "./use-scan-error-text";

export type SubmitPhase =
  | { kind: "edit" }
  | { kind: "saving" }
  | { kind: "analyzing"; scanId: string; reconnecting: boolean }
  | { kind: "slow"; scanId: string }
  | { kind: "opening"; scanId: string }
  | { kind: "failed"; scanId: string; code: string };

/**
 * What happens after "Analyse": save the scan, AI checks the photos, open the review. Focus moves to the panel's
 * heading when it appears (WCAG 2.4.3), the step list is a polite live region, and a failed analysis offers a retry
 * (when retrying can help) and "continue without AI" (the scan and its photos are already saved). A service state (AI
 * off, over today's limit, busy) is said once, by the same alert the rest of the app shows for it.
 */
export function AnalysisPanel({
  phase,
  slots,
  onRetry,
}: {
  phase: Exclude<SubmitPhase, { kind: "edit" }>;
  slots: readonly PhotoSlot[];
  onRetry: () => void;
}) {
  const t = useTranslations("scans.new");
  const errorText = useScanErrorText();
  const heading = useRef<HTMLHeadingElement>(null);
  const failedHeading = useRef<HTMLElement>(null);

  useEffect(() => {
    (phase.kind === "failed" ? failedHeading.current : heading.current)?.focus();
  }, [phase.kind]);

  const step = phase.kind === "saving" ? 0 : phase.kind === "opening" ? 2 : 1;
  const steps = [t("progress.saving"), t("progress.analyzing"), t("progress.opening")];
  const scanHref = "scanId" in phase ? `/scans/${phase.scanId}` : null;

  if (phase.kind === "failed") {
    const key = scanErrorKey(phase.code);
    const gaveUp = aiGaveUp(phase.code);
    const next = gaveUp ? t("failed.descriptionManual") : t("failed.description");
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          {isSharedStateKey(key) ? (
            <>
              <ServiceOffAlert service={key === "aiOff" ? "ai" : key === "storageOff" ? "storage" : key} />
              <p ref={(el) => void (failedHeading.current = el)} tabIndex={-1} className="text-sm outline-none">
                {next}
              </p>
            </>
          ) : (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden />
              <AlertTitle ref={(el) => void (failedHeading.current = el)} tabIndex={-1} className="outline-none">
                {t("failed.title")}
              </AlertTitle>
              <AlertDescription>
                <p>{errorText(phase.code)}</p>
                <p>{next}</p>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {scanHref && (
              <Link href={scanHref} className={buttonVariants({ variant: gaveUp ? "default" : "outline", size: "lg" })}>
                {t("failed.manual")}
              </Link>
            )}
            {!gaveUp && (
              <Button size="lg" onClick={onRetry}>
                <SparklesIcon aria-hidden />
                {t("failed.retry")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 ref={heading} tabIndex={-1} className="outline-none">
            {t("progress.title")}
          </h2>
        </CardTitle>
        <CardDescription>{phase.kind === "slow" ? t("progress.slow") : t("progress.duration")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {slots.some((s) => s.previewUrl) && (
          <ul className="flex gap-2" aria-hidden>
            {slots.map((s) =>
              s.previewUrl ? (
                <li key={s.localId} className="relative size-16 overflow-hidden rounded-lg ring-1 ring-foreground/10 sm:size-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.previewUrl} alt="" className="size-full object-cover" />
                  {phase.kind === "analyzing" && (
                    <span className="absolute inset-0 bg-primary/20 motion-safe:animate-pulse" />
                  )}
                </li>
              ) : null,
            )}
          </ul>
        )}
        <ol className="flex flex-col gap-3" aria-live="polite">
          {steps.map((label, i) => {
            const done = i < step || (phase.kind === "opening" && i === 2);
            const current = i === step && !done;
            return (
              <li key={label} className={cn("flex items-center gap-3 text-sm", !done && !current && "text-muted-foreground")}>
                {done ? (
                  <CircleCheckIcon aria-hidden className="size-5 text-success" />
                ) : current ? (
                  <Spinner aria-hidden className="size-5 text-primary" />
                ) : (
                  <CircleIcon aria-hidden className="size-5" />
                )}
                <span className={cn(current && "font-medium")}>{label}</span>
              </li>
            );
          })}
        </ol>
        {phase.kind === "analyzing" && phase.reconnecting && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("progress.reconnecting")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {phase.kind === "slow" && scanHref && (
            <Link href={scanHref} className={buttonVariants({ size: "lg" })}>
              {t("progress.openScan")}
            </Link>
          )}
          {phase.kind !== "opening" && (
            <Link href="/scans" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              {t("progress.goToList")}
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
