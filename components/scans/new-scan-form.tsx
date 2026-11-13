"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CameraIcon, ListChecksIcon, ShieldCheckIcon, SparklesIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { FormError } from "@/components/auth/form-parts";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { ServiceOffAlert } from "@/components/shared/service-off-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { analyzeScanRequest, createScanRequest, ScanApiError, scanStatusRequest } from "@/lib/scans/client/api";
import { photosBusy, photosReady, uploadedPhotoIds } from "@/lib/scans/client/photo-slots";
import { AREA_LABEL_MAX } from "@/lib/scans/constants";
import type { FilterOption, NewScanProtocol } from "@/lib/scans/queries";
import { type NewScanFormValues, newScanFormSchema } from "@/lib/scans/schemas";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { AnalysisPanel, type SubmitPhase } from "./analysis-panel";
import { PhotoPicker, type PhotoPickerHandle } from "./photo-picker";
import { usePhotoUploads } from "./use-photo-uploads";
import { useScanErrorText } from "./use-scan-error-text";

const NO_TEAM = "none";
const POLL_MS = 3_000;
const POLL_FOR_MS = 150_000;

type Props = {
  protocols: NewScanProtocol[];
  departments: FilterOption[];
  storage: boolean;
  ai: boolean;
  /** AI analyses left today (null when the AI is off). */
  aiRemaining: number | null;
  defaultProtocolId: string | null;
};

/**
 * New scan: 1) protocol, department, area; 2) 1..4 photos (camera or upload, uploaded at once); 3) save the draft scan,
 * run the AI analysis and open the review. With the AI off, over today's limit, or a protocol without photo-checkable
 * steps, the scan is saved and opened for a manual review instead. Nothing here decides access: every request is
 * checked on the server.
 */
export function NewScanForm({ protocols, departments, storage, ai, aiRemaining, defaultProtocolId }: Props) {
  const t = useTranslations("scans.new");
  const errorText = useScanErrorText();
  const actions = useTranslations("common.actions");
  const router = useRouter();
  const errorMap = useZodErrorMap();
  const photos = usePhotoUploads();
  const picker = useRef<PhotoPickerHandle>(null);
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "edit" });
  const [formError, setFormError] = useState<string | null>(null);
  /** A submit found the photos not ready: the photo hint becomes an error under the picker (and leaves the footer). */
  const [photoErrorShown, setPhotoErrorShown] = useState(false);
  const pollAbort = useRef<AbortController | null>(null);

  const form = useForm<NewScanFormValues>({
    resolver: zodResolver(newScanFormSchema, { error: errorMap }),
    defaultValues: { protocolId: defaultProtocolId ?? "", teamId: "", areaLabel: "" },
  });
  const protocolId = useWatch({ control: form.control, name: "protocolId" });
  const protocol = protocols.find((p) => p.id === protocolId) ?? null;
  const aiUsable = ai && (aiRemaining ?? 0) > 0 && (protocol ? protocol.visualSteps > 0 : true);

  // Leaving with photos that are not in a scan yet: the browser asks first.
  const unsaved = phase.kind === "edit" && photos.slots.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  useEffect(() => () => pollAbort.current?.abort(), []);

  const busy = photosBusy(photos.slots);
  const ready = photosReady(photos.slots);
  const photoHint = !storage
    ? null // the storage-off alert at the top already says why nothing can be added
    : photos.slots.length === 0
      ? t("submitHintPhotos")
      : busy
        ? t("submitHintUploading")
        : !ready
          ? t("submitHintFailed")
          : null;
  // Derived, never a copy: the error always says what is wrong NOW, and the same sentence is never shown twice.
  const photoError = photoErrorShown ? photoHint : null;

  const open = (scanId: string) => {
    setPhase({ kind: "opening", scanId });
    router.push(`/scans/${scanId}`);
  };

  /** The analyze request was cut off (network): the call goes on on the server, so watch the scan's status. */
  const poll = async (scanId: string) => {
    pollAbort.current?.abort();
    const controller = new AbortController();
    pollAbort.current = controller;
    setPhase({ kind: "analyzing", scanId, reconnecting: true });
    const outcome = await waitForAnalysis(scanId, controller.signal);
    if (outcome === "done") open(scanId);
    else if (outcome === "failed") setPhase({ kind: "failed", scanId, code: "unknown" });
    else if (outcome === "not_started") setPhase({ kind: "failed", scanId, code: "network" });
    else if (outcome === "slow") setPhase({ kind: "slow", scanId });
  };

  const analyze = async (scanId: string) => {
    setPhase({ kind: "analyzing", scanId, reconnecting: false });
    try {
      await analyzeScanRequest(scanId);
      open(scanId);
    } catch (e) {
      const code = e instanceof ScanApiError ? e.code : "unknown";
      if (code === "network" || code === "analysis_running") return void poll(scanId);
      if (code === "already_analyzed" || code === "finalized") return open(scanId);
      setPhase({ kind: "failed", scanId, code });
    }
  };

  /** The details are invalid: say what is missing about the photos in the same pass (focus goes to the first field). */
  function onInvalid() {
    setFormError(null);
    setPhotoErrorShown(!ready);
  }

  async function onSubmit(values: NewScanFormValues) {
    setFormError(null);
    if (!ready) {
      setPhotoErrorShown(true);
      picker.current?.focus();
      return;
    }
    setPhotoErrorShown(false);
    setPhase({ kind: "saving" });
    let scanId: string;
    try {
      const created = await photos.submit(() =>
        createScanRequest({
          protocolId: values.protocolId,
          teamId: values.teamId && values.teamId !== NO_TEAM ? values.teamId : null,
          areaLabel: values.areaLabel.trim(),
          photoIds: uploadedPhotoIds(photos.slots),
        }),
      );
      scanId = created.id;
    } catch (e) {
      setPhase({ kind: "edit" });
      const code = e instanceof ScanApiError ? e.code : "unknown";
      setFormError(errorText(code));
      if (code === "protocol_not_found" || code === "protocol_empty") form.setFocus("protocolId");
      return;
    }
    if (aiUsable) await analyze(scanId);
    else open(scanId);
  }

  const cancel = () => {
    photos.discardAll();
    router.push("/scans");
  };

  if (phase.kind !== "edit") {
    return <AnalysisPanel phase={phase} slots={photos.slots} onRetry={() => "scanId" in phase && void analyze(phase.scanId)} />;
  }

  const protocolItems = protocols.map((p) => ({ value: p.id, label: p.title }));
  const custom = protocols.filter((p) => p.custom);
  const global = protocols.filter((p) => !p.custom);
  const teamItems = [{ value: NO_TEAM, label: t("noDepartment") }, ...departments];

  return (
    <form onSubmit={(e) => void form.handleSubmit(onSubmit, onInvalid)(e)} noValidate className="flex flex-col gap-6 pb-2">
      <FormError message={formError} />

      {/* What cannot work on this server comes first, before anything is filled in. */}
      {!storage && <ServiceOffAlert service="storage" />}
      {storage && (!ai || aiRemaining === 0) && (
        <div className="flex flex-col gap-2">
          <ServiceOffAlert service={ai ? "aiLimit" : "ai"} />
          <p className="text-sm text-muted-foreground">{t("ai.offNote")}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2">
              <ListChecksIcon aria-hidden className="size-4.5 text-primary" />
              {t("details.title")}
            </h2>
          </CardTitle>
          <CardDescription>{t("details.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Controller
              name="protocolId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="scan-protocol">{t("protocol")}</FieldLabel>
                  <Select items={protocolItems} value={field.value || null} onValueChange={(v) => field.onChange(v ?? "")}>
                    <SelectTrigger
                      ref={field.ref}
                      id="scan-protocol"
                      className="h-11 w-full sm:h-9"
                      aria-invalid={fieldState.invalid || undefined}
                      aria-describedby={protocol ? "scan-protocol-help" : undefined}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder={t("protocolPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {custom.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>{t("groupCustom")}</SelectLabel>
                          {custom.map((p) => (
                            <ProtocolItem key={p.id} protocol={p} badge={t("customBadge")} />
                          ))}
                        </SelectGroup>
                      )}
                      <SelectGroup>
                        {custom.length > 0 && <SelectLabel>{t("groupGlobal")}</SelectLabel>}
                        {global.map((p) => (
                          <ProtocolItem key={p.id} protocol={p} />
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {protocol && (
                    <FieldDescription id="scan-protocol-help">
                      <VisualSummary protocol={protocol} />
                    </FieldDescription>
                  )}
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {departments.length > 0 && (
              <Controller
                name="teamId"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="scan-team">
                      {t("department")}{" "}
                      <span className="font-normal text-muted-foreground">({t("departmentOptional")})</span>
                    </FieldLabel>
                    <Select items={teamItems} value={field.value || NO_TEAM} onValueChange={(v) => field.onChange(v ?? NO_TEAM)}>
                      <SelectTrigger id="scan-team" className="h-11 w-full sm:h-9" onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {teamItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            )}

            <Controller
              name="areaLabel"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="scan-area">{t("area")}</FieldLabel>
                  <Input
                    id="scan-area"
                    className="h-11 sm:h-9"
                    autoComplete="off"
                    enterKeyHint="next"
                    maxLength={AREA_LABEL_MAX}
                    placeholder={t("areaPlaceholder")}
                    aria-invalid={fieldState.invalid}
                    aria-describedby="scan-area-help"
                    {...field}
                  />
                  <FieldDescription id="scan-area-help">{t("areaHint")}</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2">
              <CameraIcon aria-hidden className="size-4.5 text-primary" />
              {t("photos.title")}
            </h2>
          </CardTitle>
          <CardDescription id="scan-photos-help">{t("photos.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <PhotoPicker
            ref={picker}
            slots={photos.slots}
            event={photos.event}
            disabled={!storage}
            invalid={!!photoError}
            describedBy={photoError ? "scan-photos-help scan-photos-error" : "scan-photos-help"}
            onAdd={(images) => {
              setPhotoErrorShown(false);
              void photos.addImages(images);
            }}
            onRetry={(localId) => {
              setPhotoErrorShown(false);
              photos.retry(localId);
            }}
            onRemove={photos.remove}
          />
          {photoError && (
            <p id="scan-photos-error" role="alert" className="text-sm text-destructive">
              {photoError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("photos.uploadHint")}</p>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="mb-2 font-medium">{t("photos.tipsTitle")}</p>
            <ul className="flex flex-col gap-1.5 text-muted-foreground">
              <li className="flex gap-2">
                <SunIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t("photos.tipLight")}
              </li>
              <li className="flex gap-2">
                <CameraIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t("photos.tipClose")}
              </li>
              <li className="flex gap-2">
                <ShieldCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t("photos.tipPrivacy")}
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-backdrop-filter:bg-background/80 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {/* While the same sentence shows as the error under the photos, the footer stays quiet. */}
          <span aria-live="polite">{photoError ? null : photoHint}</span>
          {ai && aiRemaining !== null && aiRemaining > 0 && <span>{t("ai.remaining", { count: aiRemaining })}</span>}
        </div>
        <div className="flex gap-2 md:justify-end">
          <Button type="button" variant="outline" size="lg" className="h-11 flex-1 md:h-9 md:flex-none" onClick={cancel}>
            {actions("cancel")}
          </Button>
          <Button type="submit" size="lg" className="h-11 flex-[2] md:h-9 md:flex-none" disabled={!storage || form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Spinner aria-hidden /> : aiUsable ? <SparklesIcon aria-hidden /> : null}
            {aiUsable ? t("submit") : t("submitManual")}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Polls the scan until its analysis ends (or POLL_FOR_MS passes); "aborted" when the page went away. */
async function waitForAnalysis(scanId: string, signal: AbortSignal): Promise<"done" | "failed" | "not_started" | "slow" | "aborted"> {
  const until = Date.now() + POLL_FOR_MS;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (signal.aborted) return "aborted";
    try {
      const s = await scanStatusRequest(scanId, signal);
      if (s.status === "review" || s.status === "finalized") return "done";
      if (s.status === "failed") return "failed";
      if (s.status === "draft") return "not_started";
    } catch {
      if (signal.aborted) return "aborted";
      // still offline: keep waiting
    }
  }
  return signal.aborted ? "aborted" : "slow";
}

function ProtocolItem({ protocol, badge }: { protocol: NewScanProtocol; badge?: string }) {
  return (
    <SelectItem value={protocol.id} className="py-2">
      <ProtocolIcon name={protocol.icon} className="text-muted-foreground" />
      <span className="truncate">{protocol.title}</span>
      {badge && (
        <Badge variant="secondary" className="ms-1">
          {badge}
        </Badge>
      )}
    </SelectItem>
  );
}

function VisualSummary({ protocol }: { protocol: NewScanProtocol }) {
  const t = useTranslations("scans.new");
  if (protocol.visualSteps === 0) return <>{t("visualNone", { total: protocol.steps })}</>;
  if (protocol.visualSteps === protocol.steps) return <>{t("visualAll", { visual: protocol.visualSteps })}</>;
  return <>{t("visualSummary", { visual: protocol.visualSteps, manual: protocol.steps - protocol.visualSteps })}</>;
}
