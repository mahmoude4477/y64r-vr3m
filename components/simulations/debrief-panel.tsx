"use client";

import { useCompletion } from "@ai-sdk/react";
import { CircleAlertIcon, RotateCcwIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ServiceOffAlert } from "@/components/shared/service-off-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Failure = "ai" | "aiLimit" | "aiBusy" | "failed";

/** The route answers JSON { error } with an AI error code (lib/ai/errors.ts); useCompletion surfaces the body. */
function failureOf(error: unknown): Failure {
  const body = (error as { responseBody?: unknown } | null)?.responseBody;
  let code: unknown;
  try {
    code = typeof body === "string" ? (JSON.parse(body) as { error?: unknown }).error : undefined;
  } catch {
    code = undefined;
  }
  if (code === "not_configured") return "ai";
  if (code === "daily_limit") return "aiLimit";
  if (code === "too_many_requests" || code === "rate_limited" || code === "overloaded") return "aiBusy";
  return "failed";
}

/**
 * The owner's AI debrief of a completed attempt, streamed on request from
 * POST /api/simulations/attempts/<id>/debrief (useCompletion). The rule-based recommendations are already on the
 * page; this only adds a short personal summary. Streaming text sits in a polite live region marked busy until it
 * ends, so screen readers read it once instead of word by word.
 */
export function DebriefPanel({ attemptId, locale }: { attemptId: string; locale: "ar" | "en" }) {
  const t = useTranslations("simulations.result.debrief");
  const tc = useTranslations("common.actions");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [started, setStarted] = useState(false);
  const { completion, complete, isLoading } = useCompletion({
    api: `/api/simulations/attempts/${attemptId}/debrief`,
    body: { locale },
    onError: (error) => setFailure(failureOf(error)),
  });

  function generate() {
    if (isLoading) return;
    setFailure(null);
    setStarted(true);
    void complete("debrief");
  }

  const done = started && !isLoading && !failure && completion.trim().length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" aria-busy={isLoading} className="flex flex-col gap-2">
        {completion && (
          <p lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="text-sm leading-7 whitespace-pre-line">
            {completion}
          </p>
        )}
        {isLoading && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner aria-hidden />
            {t("generating")}
          </p>
        )}
        {done && <p className="sr-only">{t("done")}</p>}
      </div>
      {done && <p className="text-xs text-muted-foreground">{t("aiNote")}</p>}

      {failure === "ai" || failure === "aiLimit" || failure === "aiBusy" ? (
        <ServiceOffAlert service={failure} />
      ) : failure === "failed" ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden />
          <AlertDescription>{t("failed")}</AlertDescription>
        </Alert>
      ) : null}

      {!done && failure !== "ai" && failure !== "aiLimit" && (
        <Button
          type="button"
          variant={failure ? "outline" : "secondary"}
          className={cn("self-start print:hidden", "aria-disabled:cursor-not-allowed aria-disabled:opacity-60")}
          aria-disabled={isLoading || undefined}
          onClick={generate}
        >
          {failure ? <RotateCcwIcon aria-hidden /> : <SparklesIcon aria-hidden />}
          {failure ? tc("retry") : t("generate")}
        </Button>
      )}
    </div>
  );
}
