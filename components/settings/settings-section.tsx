import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SettingsSectionId = "profile" | "language" | "appearance" | "security" | "institutions";

/** The id of a section's h2 (client islands move focus there after a change that removes the focused control). */
export function sectionHeadingId(id: SettingsSectionId | "sessions"): string {
  return `${id}-heading`;
}

/**
 * One card of /settings: a region named by its h2 (the page has one h1, PageHeader), with the anchor the section
 * links of SettingsNav jump to. The heading takes programmatic focus (tabIndex -1), never Tab focus.
 */
export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id: SettingsSectionId;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = sectionHeadingId(id);
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-20", className)}>
      <Card>
        <CardHeader>
          <h2 id={headingId} tabIndex={-1} className="font-heading text-base leading-snug font-semibold outline-none">
            {title}
          </h2>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        {children}
      </Card>
    </section>
  );
}

/** Moves focus to a section heading (after the focused button disappeared with the change it made). */
export function focusHeading(id: SettingsSectionId | "sessions") {
  document.getElementById(sectionHeadingId(id))?.focus();
}
