import { cn } from "@/lib/utils";

/** Kicker + h2 (+ lead) at the top of a landing section. `id` goes on the h2 for aria-labelledby. */
export function SectionHeading({
  id,
  kicker,
  title,
  lead,
  className,
}: {
  id: string;
  kicker: string;
  title: string;
  lead?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <p className="text-sm font-semibold text-primary">{kicker}</p>
      <h2 id={id} className="mt-2 text-2xl/snug font-bold text-balance sm:text-3xl/snug ltr:tracking-tight">
        {title}
      </h2>
      {lead && <p className="mt-3 text-base/relaxed text-pretty text-muted-foreground">{lead}</p>}
    </div>
  );
}
