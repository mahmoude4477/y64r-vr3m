import { BookMarkedIcon, CameraIcon, ExternalLinkIcon, LightbulbIcon } from "lucide-react";
import type { Locale } from "next-intl";
import { useTranslations } from "next-intl";
import { pick, pickOrNull } from "@/lib/i18n-content";
import type { ProtocolDetailStep } from "@/lib/protocols/queries";
import { safeReferenceUrl, textLang } from "@/lib/protocols/steps";
import { cn } from "@/lib/utils";
import { CriticalBadge, MandatoryBadge, VisualCheckBadge, WeightBadge } from "./protocol-badges";

/** The ordered steps of a protocol: text, badges, why, what a photo must show, and the cited reference. */
export function StepList({ steps, locale }: { steps: readonly ProtocolDetailStep[]; locale: Locale }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <StepItem key={step.id} step={step} number={index + 1} locale={locale} />
      ))}
    </ol>
  );
}

function StepItem({ step, number, locale }: { step: ProtocolDetailStep; number: number; locale: Locale }) {
  const t = useTranslations("protocols.detail");
  const criteria = step.visualCheck ? pickOrNull(step, "criteria", locale) : null;
  const headingId = `step-${step.key}`;
  return (
    <li
      className={cn(
        "rounded-xl bg-card p-4 ring-1 ring-foreground/10 break-inside-avoid sm:p-5 print:ring-foreground/30",
        step.isCritical && "border-s-4 border-destructive/70",
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
            step.isCritical ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          {number}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h3 id={headingId} className="text-[0.95rem] leading-relaxed font-medium text-pretty">
            <span className="sr-only">{t("stepNumber", { number: String(number) })}: </span>
            {pick(step, "text", locale)}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <MandatoryBadge mandatory={step.isMandatory} />
            {step.isCritical && <CriticalBadge />}
            {step.visualCheck && <VisualCheckBadge />}
            <WeightBadge weight={step.weight} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <LightbulbIcon aria-hidden className="size-3.5 text-gold" />
              {t("why")}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{pick(step, "rationale", locale)}</p>
          </div>
          {criteria && (
            <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CameraIcon aria-hidden className="size-3.5" />
                {t("criteria")}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{criteria}</p>
            </div>
          )}
          {step.referenceLabel && <StepReference label={step.referenceLabel} url={step.referenceUrl} />}
        </div>
      </div>
    </li>
  );
}

function StepReference({ label, url }: { label: string; url: string | null }) {
  const t = useTranslations("protocols.detail");
  const href = safeReferenceUrl(url);
  const lang = textLang(label);
  return (
    <p className="flex items-start gap-1.5 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
      <BookMarkedIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">
        <span className="font-semibold text-foreground">{t("reference")}: </span>
        {href ? (
          <>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <bdi lang={lang}>{label}</bdi>
              <ExternalLinkIcon aria-hidden className="ms-1 inline size-3 align-[-0.1em] print:hidden" />
              <span className="sr-only"> {t("opensInNewTab")}</span>
            </a>
            {/* On paper the address is the link. */}
            <span dir="ltr" className="hidden break-all print:block">
              {href}
            </span>
          </>
        ) : (
          <bdi lang={lang}>{label}</bdi>
        )}
      </span>
    </p>
  );
}
