"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common.error");
  return (
    <main id="main" className="flex min-h-[60svh] items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlertIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
          </EmptyTitle>
          <EmptyDescription>{t("description")}</EmptyDescription>
          {/* The digest matches the server log line (http.request.error), so support can find this error. */}
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              {t.rich("reference", {
                digest: error.digest,
                ref: (chunks) => (
                  <bdi dir="ltr" className="font-mono">
                    {chunks}
                  </bdi>
                ),
              })}
            </p>
          )}
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => reset()}>{t("retry")}</Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
