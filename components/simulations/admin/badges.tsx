import { Building2Icon, CircleCheckIcon, EyeOffIcon, FilePenLineIcon, GitBranchIcon, GlobeIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Small labels of the admin scenario pages (Server and Client Components: hooks only, no async). Every state has an
 * icon and a text, never colour alone (CONVENTIONS 9).
 */

/** Published, or not: "Draft" while nobody has played it, "Unpublished" once it has history (e.g. a replaced version). */
export function PublishBadge({ published, played = false, className }: { published: boolean; played?: boolean; className?: string }) {
  const t = useTranslations("simulations.admin.status");
  if (published) {
    return (
      // Text in the foreground colour (the success green on its own tint is too light for small text), icon in green.
      <Badge variant="outline" className={cn("border-transparent bg-success/12 text-foreground ring-1 ring-success/30", className)}>
        <CircleCheckIcon aria-hidden className="text-success" />
        {t("published")}
      </Badge>
    );
  }
  const Icon = played ? EyeOffIcon : FilePenLineIcon;
  return (
    <Badge variant="outline" className={cn("border-transparent bg-muted text-muted-foreground ring-1 ring-border", className)}>
      <Icon aria-hidden />
      {played ? t("unpublished") : t("draft")}
    </Badge>
  );
}

export function VersionBadge({ version, className }: { version: number; className?: string }) {
  const t = useTranslations("simulations.admin");
  const format = useFormatter();
  return (
    <Badge variant="outline" className={className}>
      <GitBranchIcon aria-hidden />
      {t("version", { n: format.number(version, "integer") })}
    </Badge>
  );
}

/** Global (every user) or the institution that owns the scenario. */
export function OwnerLabel({ owner, className }: { owner: { name: string } | null; className?: string }) {
  const t = useTranslations("simulations.admin.owner");
  const Icon = owner ? Building2Icon : GlobeIcon;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">{t("label")}: </span>
      {owner ? <bdi className="truncate">{owner.name}</bdi> : t("global")}
    </span>
  );
}
