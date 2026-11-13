"use client";

import { CameraIcon, CircleAlertIcon, CircleCheckIcon, ImagePlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type Ref, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cameraSupported } from "@/lib/scans/client/camera";
import type { PhotoSlot } from "@/lib/scans/client/photo-slots";
import { MAX_PHOTOS_PER_SCAN } from "@/lib/scans/constants";
import { cn } from "@/lib/utils";
import { CameraDialog } from "./camera-dialog";
import type { PhotoEvent } from "./use-photo-uploads";
import { useScanErrorText } from "./use-scan-error-text";
import { TONE_TEXT } from "@/components/shared/status-badges";

export type PhotoPickerHandle = { focus: () => void };

type Props = {
  slots: readonly PhotoSlot[];
  event: PhotoEvent;
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  onAdd: (images: Blob[]) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
  ref?: Ref<PhotoPickerHandle>;
};

/**
 * 1..4 photos: a camera button (in-app rear camera) and an upload button (gallery / files, or the phone's own camera),
 * then one tile per photo with its upload progress, a retry when it failed and a remove button.
 */
export function PhotoPicker({ slots, event, disabled, invalid, describedBy, onAdd, onRetry, onRemove, ref }: Props) {
  const t = useTranslations("scans.new.photos");
  const errorText = useScanErrorText();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSession, setCameraSession] = useState(0);
  const full = slots.length >= MAX_PHOTOS_PER_SCAN;

  useImperativeHandle(ref, () => ({ focus: () => cameraButton.current?.focus() }), []);

  const openCamera = () => {
    if (!cameraSupported()) {
      fileInput.current?.click();
      return;
    }
    setCameraSession((n) => n + 1);
    setCameraOpen(true);
  };

  const announcement = event
    ? event.kind === "uploaded"
      ? t("uploaded", { number: String(event.number) })
      : t("failed", { number: String(event.number), reason: errorText(event.error) })
    : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button
          ref={cameraButton}
          type="button"
          size="lg"
          className="h-11 sm:h-9"
          onClick={openCamera}
          disabled={disabled || full}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        >
          <CameraIcon aria-hidden />
          {t("takePhoto")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 sm:h-9"
          onClick={() => fileInput.current?.click()}
          disabled={disabled || full}
          aria-describedby={describedBy}
        >
          <ImagePlusIcon aria-hidden />
          {t("upload")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="scan-photo-input"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) onAdd(files);
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{t("count", { count: String(slots.length), max: String(MAX_PHOTOS_PER_SCAN) })}</span>
        {full && <span>{t("full", { max: String(MAX_PHOTOS_PER_SCAN) })}</span>}
      </div>

      {slots.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {slots.map((slot, i) => (
            <PhotoTile
              key={slot.localId}
              slot={slot}
              number={i + 1}
              disabled={disabled}
              onRetry={() => onRetry(slot.localId)}
              onRemove={() => onRemove(slot.localId)}
            />
          ))}
        </ul>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <CameraDialog
        key={cameraSession}
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={(image) => onAdd([image])}
        taken={slots.length}
        max={MAX_PHOTOS_PER_SCAN}
        onUploadInstead={() => fileInput.current?.click()}
      />
    </div>
  );
}

function PhotoTile({
  slot,
  number,
  disabled,
  onRetry,
  onRemove,
}: {
  slot: PhotoSlot;
  number: number;
  disabled: boolean;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("scans.new.photos");
  const errorText = useScanErrorText();
  const actions = useTranslations("common.actions");
  const percent = Math.round(slot.progress * 100);
  const n = String(number);
  const label = t("photoLabel", { number: n });
  const state =
    slot.status === "preparing"
      ? t("preparing", { number: n })
      : slot.status === "uploading"
        ? t("uploading", { number: n, percent: String(percent) })
        : slot.status === "uploaded"
          ? t("uploaded", { number: n })
          : t("failed", { number: n, reason: errorText(slot.error) });

  return (
    <li
      className={cn(
        "relative aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10",
        slot.status === "failed" && "ring-2 ring-destructive/60",
      )}
      data-status={slot.status}
    >
      {slot.previewUrl ? (
        // A local blob: preview of the prepared JPEG (never next/image, CONVENTIONS 9).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slot.previewUrl} alt={label} className={cn("size-full object-cover", slot.status !== "uploaded" && "opacity-80")} />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          {slot.status === "preparing" ? <Spinner aria-hidden className="size-6" /> : <CircleAlertIcon aria-hidden className="size-6 text-destructive" />}
        </div>
      )}

      <span className="sr-only">{state}</span>

      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="absolute top-1.5 end-1.5 rounded-full bg-background/90 shadow-sm backdrop-blur hover:bg-background"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t("remove", { number: n })}
      >
        <XIcon aria-hidden />
      </Button>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-background/95 via-background/70 to-transparent p-2 pt-6">
        {slot.status === "uploading" && <Progress value={percent} aria-label={label} />}
        {slot.status === "uploaded" && (
          <span
            className={cn("flex items-center gap-1 text-xs font-medium", TONE_TEXT.success)}
            aria-hidden
          >
            <CircleCheckIcon className="size-3.5" />
            {label}
          </span>
        )}
        {slot.status === "preparing" && (
          <span className="text-xs text-muted-foreground" aria-hidden>
            {label}
          </span>
        )}
        {slot.status === "failed" && (
          <div className="flex flex-col gap-1.5">
            <span className="line-clamp-2 text-xs font-medium text-destructive" aria-hidden>
              {errorText(slot.error)}
            </span>
            {slot.file && (
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={onRetry} disabled={disabled} aria-label={t("retry", { number: n })}>
                <RotateCcwIcon aria-hidden />
                {actions("retry")}
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
