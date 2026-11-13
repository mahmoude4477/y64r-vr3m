"use client";

import { CameraIcon, CameraOffIcon, ImageUpIcon, RefreshCwIcon, SwitchCameraIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  type CameraProblem,
  cameraProblem,
  captureFrame,
  type Facing,
  hasSeveralCameras,
  openCamera,
  stopStream,
} from "@/lib/scans/client/camera";
import { cn } from "@/lib/utils";

type Status = "starting" | "live" | CameraProblem;

const SLOW_START_MS = 8_000;

/**
 * Full-screen camera on phones (a large dialog on desktop): the rear camera by default, a big capture button, a
 * front/back switch when the device has several cameras. Each capture is handed to onCapture and the camera stays
 * open for the next photo until the scan is full. When the camera is blocked, missing or busy, it says why and offers
 * the file upload instead. The stream is stopped whenever the dialog closes.
 */
export function CameraDialog({
  open,
  onOpenChange,
  onCapture,
  taken,
  max,
  onUploadInstead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (image: Blob) => void;
  taken: number;
  max: number;
  onUploadInstead: () => void;
}) {
  const t = useTranslations("scans.new.camera");
  const [status, setStatus] = useState<Status>("starting");
  const [facing, setFacing] = useState<Facing>("environment");
  const [canSwitch, setCanSwitch] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The browser's permission prompt (or a slow camera) can keep "starting" open: after a while, say so and offer the
  // upload right there instead of a spinner with no way out.
  const [slowStart, setSlowStart] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const attach = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (video && streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => undefined);
    }
  }, []);

  // One camera stream per (open, facing, attempt); stopped when any of them changes or the dialog closes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const slow = setTimeout(() => {
      if (!cancelled) setSlowStart(true);
    }, SLOW_START_MS);
    openCamera(facing).then(
      async (s) => {
        clearTimeout(slow);
        if (cancelled) {
          stopStream(s);
          return;
        }
        stream = s;
        streamRef.current = s;
        attach(videoRef.current);
        setStatus("live");
        const several = await hasSeveralCameras();
        if (!cancelled) setCanSwitch(several);
      },
      (e: unknown) => {
        clearTimeout(slow);
        if (!cancelled) setStatus(cameraProblem(e));
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(slow);
      stopStream(stream);
      if (streamRef.current === stream) streamRef.current = null;
    };
  }, [open, facing, attempt, attach]);

  const restart = (side: Facing) => {
    setStatus("starting");
    setSlowStart(false);
    if (side !== facing) setFacing(side);
    else setAttempt((n) => n + 1);
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);
    try {
      const image = await captureFrame(video);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      onCapture(image);
      if (taken + 1 >= max) onOpenChange(false);
    } catch {
      setStatus("error");
    } finally {
      setCapturing(false);
    }
  };

  const problem = status !== "starting" && status !== "live";
  const uploadInstead = () => {
    onOpenChange(false);
    onUploadInstead();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[calc(100dvh-1rem)] max-h-[48rem] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-w-2xl"
      >
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </div>
          <DialogClose
            render={
              <Button variant="ghost" size="icon" className="shrink-0" aria-label={t("close")} />
            }
          >
            <XIcon aria-hidden />
          </DialogClose>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted sm:aspect-[4/3] sm:flex-none">
          {problem ? (
            <div className="flex w-full max-w-md flex-col items-center gap-4 p-6 text-center">
              <CameraOffIcon aria-hidden className="size-10 text-muted-foreground" />
              <Alert className="text-start" role="alert">
                <AlertDescription>{t(status)}</AlertDescription>
              </Alert>
              <div className="flex flex-wrap justify-center gap-2">
                {status !== "unsupported" && status !== "unavailable" && (
                  <Button variant="secondary" size="lg" onClick={() => restart(facing)}>
                    <RefreshCwIcon aria-hidden />
                    {t("tryAgain")}
                  </Button>
                )}
                <Button size="lg" onClick={uploadInstead}>
                  <ImageUpIcon aria-hidden />
                  {t("uploadInstead")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={attach}
                autoPlay
                playsInline
                muted
                aria-hidden
                className={cn("size-full bg-black object-cover", facing === "user" && "-scale-x-100")}
              />
              {status === "starting" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-muted p-6 text-center">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                    <Spinner aria-hidden />
                    {slowStart ? t("slowStart") : t("starting")}
                  </p>
                  {slowStart && (
                    <Button variant="outline" size="lg" onClick={uploadInstead}>
                      <ImageUpIcon aria-hidden />
                      {t("uploadInstead")}
                    </Button>
                  )}
                </div>
              )}
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 bg-background opacity-0 motion-safe:transition-opacity motion-safe:duration-150",
                  flash && "opacity-70",
                )}
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-3 items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-start">
            {canSwitch && status === "live" && (
              <Button
                variant="outline"
                size="icon-lg"
                aria-label={t("switch")}
                onClick={() => restart(facing === "environment" ? "user" : "environment")}
              >
                <SwitchCameraIcon aria-hidden />
              </Button>
            )}
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={capture}
              disabled={status !== "live" || capturing || taken >= max}
              aria-label={t("capture")}
              className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-primary/25 outline-none transition-transform focus-visible:ring-ring active:scale-95 disabled:opacity-40"
            >
              {capturing ? <Spinner aria-hidden className="size-6" /> : <CameraIcon aria-hidden className="size-7" />}
            </button>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {t("taken", { count: String(taken), max: String(max) })}
            </span>
            <DialogClose render={<Button variant="secondary" size="lg" className="h-10 px-4" />}>{t("done")}</DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
