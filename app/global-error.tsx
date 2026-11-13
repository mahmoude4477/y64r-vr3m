"use client";

// Last-resort error page: the ROOT layout (app/[locale]/layout.tsx) itself failed, so Next replaces the whole
// document with this component. No layout, no providers and no locale are available here: it has its own <html> and
// <body> and shows both languages, with the copy from messages/{ar,en}/common.json (never hard-coded text).
// Errors below the root layout use app/[locale]/error.tsx instead.
import "./globals.css";
import ar from "@/messages/ar/common.json";
import en from "@/messages/en/common.json";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="flex min-h-full items-center justify-center bg-background p-6 font-sans text-foreground">
        <main id="main" className="flex w-full max-w-md flex-col items-center gap-6 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold">{ar.error.title}</h1>
            <p className="text-sm text-muted-foreground">{ar.error.description}</p>
          </div>
          <div lang="en" dir="ltr" className="flex flex-col gap-2">
            <p className="text-lg font-semibold">{en.error.title}</p>
            <p className="text-sm text-muted-foreground">{en.error.description}</p>
          </div>
          {/* The digest matches the server log line (http.request.error). */}
          {error.digest && (
            <p dir="ltr" className="font-mono text-xs text-muted-foreground">
              {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {ar.error.retry} · <span lang="en">{en.error.retry}</span>
          </button>
        </main>
      </body>
    </html>
  );
}
