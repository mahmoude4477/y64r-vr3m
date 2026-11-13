import { CircleSlashIcon, CrownIcon, GraduationCapIcon, ScanSearchIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { OrgRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// Institution role as color + icon + text (never color alone). Works in Server and Client Components.
const roleConfig: Record<OrgRole, { icon: typeof CrownIcon; style: string }> = {
  owner: {
    icon: CrownIcon,
    style: "bg-gold/15 text-[color-mix(in_oklab,var(--gold),var(--warning-foreground)_50%)] ring-1 ring-gold/35 dark:text-gold",
  },
  admin: { icon: ShieldCheckIcon, style: "bg-primary/10 text-primary ring-1 ring-primary/25" },
  // Plain text-info on its 12% tint is below 4.5:1 in light mode (axe): darken the text there, as for gold.
  examiner: {
    icon: ScanSearchIcon,
    style: "bg-info/12 text-[color-mix(in_oklch,var(--info),var(--foreground)_30%)] ring-1 ring-info/25 dark:text-info",
  },
  trainee: { icon: GraduationCapIcon, style: "bg-muted text-muted-foreground ring-1 ring-border" },
};

/** `role` null = a row with no Waqaya role (lib/org/roles.ts memberRole): "No role", which gives no access. */
export function RoleBadge({ role, className }: { role: OrgRole | null; className?: string }) {
  const t = useTranslations("common.roles");
  const org = useTranslations("org");
  if (role === null) {
    return (
      <Badge variant="outline" className={cn("border-dashed text-muted-foreground", className)}>
        <CircleSlashIcon aria-hidden />
        {org("noRole")}
      </Badge>
    );
  }
  const { icon: Icon, style } = roleConfig[role];
  return (
    <Badge variant="outline" className={cn("border-transparent", style, className)}>
      <Icon aria-hidden />
      {t(role)}
    </Badge>
  );
}

export function RoleIcon({ role, className }: { role: OrgRole; className?: string }) {
  const Icon = roleConfig[role].icon;
  return <Icon aria-hidden className={className} />;
}
