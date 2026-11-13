"use client";

import { useTranslations } from "next-intl";
import { ThemeProvider } from "next-themes";
import * as z from "zod";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Zod 4 probes `new Function("")` once to decide whether to JIT-compile object parsers. The CSP has no
// 'unsafe-eval' (lib/security-headers.ts), so that probe would fire a CSP violation on the first form parse
// (zod catches the error, the browser still reports it). Interpreted parsing is plenty for forms.
z.config({ jitless: true });

// next-themes renders an inline <script> that sets the theme class before first paint. It only runs from the
// server HTML. When React renders it on the client instead of hydrating it (hard 404 pages in dev, a client
// re-render of the root), React 19 logs "Encountered a script tag while rendering React component". A
// non-JavaScript type on the client marks it as a data block, which React does not warn about; the server
// copy keeps the JavaScript type and runs. The type mismatch is covered by next-themes' suppressHydrationWarning
// on that element, and on the client ThemeProvider applies the theme in an effect anyway.
const THEME_SCRIPT_PROPS = { type: typeof window === "undefined" ? "text/javascript" : "text/plain" };

export function Providers({ dir, children }: { dir: "rtl" | "ltr"; children: React.ReactNode }) {
  const t = useTranslations("common.toasts");
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange scriptProps={THEME_SCRIPT_PROPS}>
      {/* <html dir> styles the page; DirectionProvider tells Base UI (portals, menus, keyboard nav). */}
      <DirectionProvider direction={dir}>
        <TooltipProvider>
          {children}
          {/* Translated screen-reader labels: sonner's defaults are English ("Notifications", "Close toast"). No richColors:
              its green-on-pale-green success toast was 4.3:1 in light mode (axe color-contrast); the plain toast uses
              the popover tokens and keeps the coloured icon. */}
          <Toaster
            dir={dir}
            position={dir === "rtl" ? "bottom-left" : "bottom-right"}
            closeButton
            containerAriaLabel={t("region")}
            toastOptions={{ closeButtonAriaLabel: t("close") }}
          />
        </TooltipProvider>
      </DirectionProvider>
    </ThemeProvider>
  );
}
