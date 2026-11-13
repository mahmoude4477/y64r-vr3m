import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A report section: an h2 title (the page h1 is PageHeader), an optional description and action. The card is a
 * link target (`#<id>`) and a size container: its lists switch to tables by the card's own width (`@2xl:` etc.), not
 * the screen's, because the sidebar takes a third of a tablet.
 *
 * On paper (`print`): a short card ("avoid", the default) never breaks across pages; a card that holds a long table
 * or list ("flow") may, so a page is not left mostly blank before it. Its title stays with what follows, and table
 * rows and list items are never cut in half.
 */
export function ReportCard({
  id,
  title,
  description,
  action,
  children,
  className,
  print = "avoid",
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  print?: "avoid" | "flow";
}) {
  return (
    <Card
      id={id}
      role="region"
      aria-labelledby={`${id}-title`}
      className={cn(
        "min-w-0 scroll-mt-24 print:shadow-none print:ring-1",
        print === "avoid" ? "print:break-inside-avoid" : "print:break-inside-auto print:[&_li]:break-inside-avoid print:[&_tr]:break-inside-avoid",
        className,
      )}
    >
      <CardHeader className={cn(action && "grid-cols-[1fr_auto]", "print:break-after-avoid")}>
        <h2 id={`${id}-title`} className="font-heading text-base leading-snug font-medium">
          {title}
        </h2>
        {action && <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end print:hidden">{action}</div>}
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="@container min-w-0">{children}</CardContent>
    </Card>
  );
}

/** One headline number (dataviz stat tile: label, value, optional hint; proportional figures for the value). */
export function StatTile({
  label,
  value,
  hint,
  badge,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <Card size="sm" className="min-w-0 print:break-inside-avoid print:shadow-none">
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
          {badge}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function StatGrid({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {children}
    </section>
  );
}
