import { CircleCheckIcon, FilePenLineIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Published / draft (icon + text + color), for the editor and the management lists. Server or client. */
export function ProtocolStatusBadge({ published, className }: { published: boolean; className?: string }) {
  const t = useTranslations("protocols.editor.status");
  return published ? (
    <Badge
      variant="outline"
      className={cn(
        // Darkened toward the text color in light mode: plain --success on its 12% tint is below 4.5:1.
        "border-transparent bg-success/12 text-[color-mix(in_oklch,var(--success),var(--foreground)_35%)] ring-1 ring-success/25 dark:text-success",
        className,
      )}
    >
      <CircleCheckIcon aria-hidden />
      {t("published")}
    </Badge>
  ) : (
    <Badge variant="outline" className={cn("border-transparent bg-muted text-muted-foreground ring-1 ring-border", className)}>
      <FilePenLineIcon aria-hidden />
      {t("draft")}
    </Badge>
  );
}
