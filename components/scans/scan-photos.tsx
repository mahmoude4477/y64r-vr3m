"use client";

import { ChevronLeftIcon, ChevronRightIcon, ImageOffIcon, XIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ServiceOffAlert } from "@/components/shared/service-off-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ScanPhotoRef = { id: string; width: number; height: number };

const ZOOMS = [1, 2, 3] as const;

const photoUrl = (id: string) => `/api/scans/photos/${encodeURIComponent(id)}`;

/**
 * The scan's photos: thumbnails (sized from the stored width / height, so nothing shifts while they load) that open a
 * viewer with zoom (buttons, a tap on the photo, + / - keys) and previous / next (buttons and the arrow keys, mirrored in
 * Arabic). Photos load through the authenticated /api/scans/photos/<id> route (302 to a short-lived URL, CONVENTIONS 9).
 * With storage off the scan stays usable: a notice replaces the photos.
 */
export function ScanPhotos({
  photos,
  area,
  storage,
  eager = false,
}: {
  photos: readonly ScanPhotoRef[];
  area: string;
  storage: boolean;
  /** The report loads its (at most 4) photos at once, so printing or saving a PDF never catches them unloaded. */
  eager?: boolean;
}) {
  const t = useTranslations("scans.detail.photos");
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const total = photos.length;

  if (total === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;

  const markBroken = (id: string) => setBroken((b) => new Set(b).add(id));

  if (!storage) {
    return (
      <div className="flex flex-col gap-3">
        <ServiceOffAlert service="storage" />
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t("count", { count: total })}>
          {photos.map((p, i) => (
            <li key={p.id}>
              <Unavailable label={t("alt", { number: String(i + 1), total: String(total), area })} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id}>
            {broken.has(p.id) ? (
              <Unavailable label={t("alt", { number: String(i + 1), total: String(total), area })} />
            ) : (
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={t("open", { number: String(i + 1), total: String(total) })}
                className="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- photos come from our authenticated 302 route (CONVENTIONS 9) */}
                <img
                  src={photoUrl(p.id)}
                  alt={t("alt", { number: String(i + 1), total: String(total), area })}
                  width={p.width}
                  height={p.height}
                  loading={eager ? "eager" : "lazy"}
                  decoding="async"
                  onError={() => markBroken(p.id)}
                  className="size-full object-cover transition-transform motion-safe:group-hover:scale-[1.03]"
                />
                <span className="absolute end-1.5 bottom-1.5 rounded-md bg-background/85 p-1 text-foreground shadow-sm print:hidden">
                  <ZoomInIcon aria-hidden className="size-4" />
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <PhotoViewer
        photos={photos}
        area={area}
        index={open}
        onIndexChange={setOpen}
        onBroken={markBroken}
        broken={broken}
      />
    </>
  );
}

function Unavailable({ label }: { label: string }) {
  const t = useTranslations("scans.detail.photos");
  return (
    <div
      role="img"
      aria-label={`${label}. ${t("unavailable")}`}
      className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground ring-1 ring-foreground/10"
    >
      <ImageOffIcon aria-hidden className="size-5" />
      <span aria-hidden>{t("unavailable")}</span>
    </div>
  );
}

function PhotoViewer({
  photos,
  area,
  index,
  onIndexChange,
  onBroken,
  broken,
}: {
  photos: readonly ScanPhotoRef[];
  area: string;
  index: number | null;
  onIndexChange: (index: number | null) => void;
  onBroken: (id: string) => void;
  broken: ReadonlySet<string>;
}) {
  const t = useTranslations("scans.detail.photos");
  const actions = useTranslations("common.actions");
  const rtl = useLocale() === "ar";
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const scroller = useRef<HTMLDivElement>(null);
  const total = photos.length;
  const photo = index === null ? null : photos[index];

  const go = (delta: number) => {
    if (index === null || total < 2) return;
    setZoom(1);
    onIndexChange((index + delta + total) % total);
  };
  const zoomTo = (next: number, at?: { x: number; y: number }) => {
    const level = ZOOMS.find((z) => z === next) ?? 1;
    const el = scroller.current;
    // Keep the tapped point (or the centre) under the finger after the zoom.
    const fx = el && at ? (el.scrollLeft + at.x) / el.scrollWidth : 0.5;
    const fy = el && at ? (el.scrollTop + at.y) / el.scrollHeight : 0.5;
    setZoom(level);
    requestAnimationFrame(() => {
      if (!el) return;
      el.scrollLeft = fx * el.scrollWidth - el.clientWidth / 2;
      el.scrollTop = fy * el.scrollHeight - el.clientHeight / 2;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") go(rtl ? -1 : 1);
    else if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
    else if (e.key === "+" || e.key === "=") zoomTo(Math.min(zoom + 1, 3));
    else if (e.key === "-") zoomTo(Math.max(zoom - 1, 1));
    else return;
    e.preventDefault();
  };

  return (
    <Dialog
      open={photo !== null}
      onOpenChange={(open) => {
        if (!open) {
          onIndexChange(null);
          setZoom(1);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        className="flex h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[calc(100dvh-4rem)] sm:max-w-5xl"
      >
        {photo && index !== null && (
          <>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle>{t("viewerTitle", { number: String(index + 1), total: String(total) })}</DialogTitle>
                <DialogDescription className="truncate">
                  <bdi>{area}</bdi>
                </DialogDescription>
              </div>
              <DialogClose render={<Button variant="ghost" size="icon" aria-label={actions("close")} />}>
                <XIcon aria-hidden />
              </DialogClose>
            </div>
            <div ref={scroller} className={cn("relative min-h-0 flex-1 bg-muted/60", zoom === 1 ? "overflow-hidden" : "overflow-auto")}>
              {broken.has(photo.id) ? (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <ImageOffIcon aria-hidden className="size-6" />
                  {t("unavailable")}
                </div>
              ) : (
                // The tap on the photo is a pointer shortcut for the zoom buttons below (keyboard: the buttons, + and -).
                // eslint-disable-next-line @next/next/no-img-element -- our authenticated 302 route (CONVENTIONS 9)
                <img
                  key={photo.id}
                  src={photoUrl(photo.id)}
                  alt={t("alt", { number: String(index + 1), total: String(total), area })}
                  width={photo.width}
                  height={photo.height}
                  decoding="async"
                  onError={() => onBroken(photo.id)}
                  onClick={(e) => {
                    const box = scroller.current?.getBoundingClientRect();
                    const at = box ? { x: e.clientX - box.left, y: e.clientY - box.top } : undefined;
                    zoomTo(zoom === 1 ? 2 : 1, at);
                  }}
                  className={cn(
                    "mx-auto select-none",
                    zoom === 1 ? "size-full cursor-zoom-in object-contain" : "h-auto max-w-none cursor-zoom-out",
                  )}
                  style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <p className="hidden text-xs text-muted-foreground sm:block">{t("zoomHint")}</p>
              <div className="flex w-full items-center justify-between gap-1 sm:w-auto">
                <Button variant="outline" size="icon-lg" className="size-11 sm:size-9" onClick={() => go(-1)} disabled={total < 2} aria-label={t("previous")}>
                  <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
                </Button>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-lg" className="size-11 sm:size-9"
                    onClick={() => zoomTo(zoom - 1)}
                    disabled={zoom === 1}
                    aria-label={t("zoomOut")}
                  >
                    <ZoomOutIcon aria-hidden />
                  </Button>
                  <span className="w-10 text-center text-sm tabular-nums" aria-live="polite">
                    <bdi>{zoom}×</bdi>
                  </span>
                  <Button
                    variant="outline"
                    size="icon-lg" className="size-11 sm:size-9"
                    onClick={() => zoomTo(zoom + 1)}
                    disabled={zoom === 3}
                    aria-label={t("zoomIn")}
                  >
                    <ZoomInIcon aria-hidden />
                  </Button>
                </div>
                <Button variant="outline" size="icon-lg" className="size-11 sm:size-9" onClick={() => go(1)} disabled={total < 2} aria-label={t("next")}>
                  <ChevronRightIcon aria-hidden className="rtl:rotate-180" />
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
