"use client";

import { ChevronDownIcon, DownloadIcon, PrinterIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

/** The file name the server gave (Content-Disposition: attachment; filename="…"). */
export function filenameFrom(disposition: string | null, fallback: string): string {
  const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
  return match?.[1] ?? fallback;
}

/** Hands a downloaded file to the browser's own download (an object URL, released once the click is done). */
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * "Export" menu. Each item fetches /api/reports/export (the server checks the role, applies the same filters and
 * limits the rate) and saves the file; a toast says what happened: the file is ready (with its row count), it was
 * cut at the row cap, or why there is no file (too many exports this hour and when to try again, signed out, no
 * access any more, a server or network error). A plain download link would fail silently on all of these.
 */
export function ExportMenu({
  items,
  note,
}: {
  items: ReadonlyArray<{ key: string; label: string; href: string }>;
  note: string;
}) {
  const t = useTranslations("reports.export");
  const common = useTranslations("common.actions");
  const format = useFormatter();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function download(item: { key: string; label: string; href: string }) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const id = toast.loading(t("preparing", { name: item.label }));
    try {
      const res = await fetch(item.href, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const message =
          res.status === 429
            ? t("errors.tooMany", { minutes: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter / 60) : 60 })
            : res.status === 401
              ? t("errors.signedOut")
              : res.status === 403
                ? t("errors.forbidden")
                : t("errors.failed");
        toast.error(message, { id });
        return;
      }
      const blob = await res.blob();
      saveFile(blob, filenameFrom(res.headers.get("content-disposition"), `waqaya-${item.key}.csv`));
      const rows = Number(res.headers.get("x-export-rows") ?? "0") || 0;
      if (res.headers.get("x-export-truncated") === "1") {
        toast.warning(t("truncated", { count: format.number(rows, "integer") }), { id, duration: 12_000 });
      } else {
        toast.success(t("ready", { count: rows }), { id });
      }
    } catch {
      toast.error(t("errors.network"), { id });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      {/* aria-disabled, not disabled: a disabled button drops the keyboard focus to the page. */}
      <DropdownMenuTrigger render={<Button variant="outline" className="min-h-8" aria-busy={busy || undefined} />}>
        {busy ? <Spinner aria-hidden /> : <DownloadIcon aria-hidden />}
        {common("exportCsv")}
        <ChevronDownIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-pretty whitespace-normal">{note}</DropdownMenuLabel>
          {items.map((item) => (
            <DropdownMenuItem
              key={item.key}
              className="min-h-10"
              aria-disabled={busy || undefined}
              onClick={() => void download(item)}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Opens the browser's print dialog (the print view's own button). */
export function PrintButton() {
  const t = useTranslations("common.actions");
  return (
    <Button type="button" className="min-h-8 print:hidden" onClick={() => window.print()}>
      <PrinterIcon aria-hidden />
      {t("print")}
    </Button>
  );
}

/**
 * Prints in light colors even when the screen is dark (dark text tokens on white paper would be unreadable, and
 * browsers drop background colors by default): the `dark` class is lifted for the print and put back after.
 */
export function PrintInLightColors() {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains("dark");
      if (wasDark) root.classList.remove("dark");
    };
    const after = () => {
      if (wasDark) root.classList.add("dark");
      wasDark = false;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, []);
  return null;
}
