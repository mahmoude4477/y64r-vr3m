"use client";

import { CircleAlertIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ServiceOffAlert } from "@/components/shared/service-off-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { analyzeScanRequest, ScanApiError, scanStatusRequest } from "@/lib/scans/client/api";
import { aiGaveUp } from "@/lib/scans/client/errors";
import { useScanErrorText } from "./use-scan-error-text";

const POLL_MS = 3_000;
const POLL_FOR_MS = 150_000;

/**
 * AI analysis from the review screen, for a scan saved without it (AI off at the time, the examiner chose "save and
 * review", or the analysis failed). Runs POST /api/scans/<id>/analyze, then reloads the page data; a dropped connection
 * falls back to polling the scan's status (the call goes on on the server). The examiner can always answer by hand.
 */
export function ScanAnalysisCard({
  scanId,
  failed,
  ai,
  aiRemaining,
}: {
  scanId: string;
  failed: boolean;
  ai: boolean;
  aiRemaining: number | null;
}) {
  const t = useTranslations("scans.detail.analysis");
  const tn = useTranslations("scans.new.ai");
  const errorText = useScanErrorText();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  if (!ai) return <ServiceOffAlert service="ai" />;
  if (aiRemaining === 0) return <ServiceOffAlert service="aiLimit" />;

  const done = () => {
    toast.success(t("done"));
    router.refresh();
  };

  const run = async () => {
    setError(null);
    setRunning(true);
    try {
      await analyzeScanRequest(scanId);
      done();
    } catch (e) {
      const code = e instanceof ScanApiError ? e.code : "unknown";
      if (code === "network" || code === "analysis_running") {
        abort.current?.abort();
        abort.current = new AbortController();
        const outcome = await waitForAnalysis(scanId, abort.current.signal);
        if (outcome === "done") return done();
        if (outcome === "aborted") return;
        setRunning(false);
        setError(outcome === "slow" ? t("slow") : errorText(code));
        return;
      }
      if (code === "already_analyzed" || code === "finalized") return router.refresh();
      setRunning(false);
      setError(errorText(code));
      if (aiGaveUp(code)) router.refresh();
    }
  };

  return (
    <section aria-labelledby="scan-analysis-title" className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      <h2 id="scan-analysis-title" className="flex items-center gap-2 font-semibold">
        <SparklesIcon aria-hidden className="size-4.5 text-primary" />
        {t("title")}
      </h2>
      {running ? (
        <p role="status" className="flex items-start gap-2 text-sm">
          <Spinner aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium">{t("running")}</span>
            <span className="block text-muted-foreground">{t("runningHint")}</span>
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{failed ? t("failed") : t("notRun")}</p>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden />
          <AlertDescription role="alert">{error}</AlertDescription>
        </Alert>
      )}
      {!running && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="h-11 sm:h-9" onClick={() => void run()}>
            <SparklesIcon aria-hidden />
            {failed ? t("retry") : t("run")}
          </Button>
          {aiRemaining !== null && <span className="text-xs text-muted-foreground">{tn("remaining", { count: aiRemaining })}</span>}
        </div>
      )}
    </section>
  );
}

/** The page was opened while the analysis runs: wait for it, then show the verdicts. */
export function ScanAnalysisRunning({ scanId }: { scanId: string }) {
  const t = useTranslations("scans.detail.analysis");
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void waitForAnalysis(scanId, controller.signal).then((outcome) => {
      if (outcome === "aborted") return;
      if (outcome === "slow") setSlow(true);
      else router.refresh();
    });
    return () => controller.abort();
  }, [scanId, router]);

  return (
    <Alert>
      {slow ? <CircleAlertIcon aria-hidden /> : <Spinner aria-hidden />}
      <AlertTitle>{t("running")}</AlertTitle>
      <AlertDescription role="status">
        <p>{slow ? t("slow") : t("runningHint")}</p>
        {slow && (
          <Button variant="outline" className="mt-2 h-10" onClick={() => router.refresh()}>
            <RefreshCwIcon aria-hidden />
            {t("reload")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** Polls the scan until its analysis ends (or POLL_FOR_MS passes). */
async function waitForAnalysis(scanId: string, signal: AbortSignal): Promise<"done" | "slow" | "aborted"> {
  const until = Date.now() + POLL_FOR_MS;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (signal.aborted) return "aborted";
    try {
      const s = await scanStatusRequest(scanId, signal);
      if (s.status !== "analyzing") return "done";
    } catch {
      if (signal.aborted) return "aborted";
      // offline for a moment: keep waiting
    }
  }
  return signal.aborted ? "aborted" : "slow";
}
