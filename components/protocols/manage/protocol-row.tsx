import { GitBranchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { Link } from "@/i18n/navigation";
import { CategoryBadge } from "../protocol-badges";
import { ProtocolStatusBadge } from "../editor/status-badge";

/**
 * One protocol in a management list (/admin/protocols, /org/protocols). The title is the row's only link and
 * stretches over the whole row (one tap target, one link name for screen readers). `meta` items are short facts
 * separated by dots; `note` is an extra line (source, institution); `notice` a highlighted one (a newer version of the
 * source is published). The row's link covers it, so neither holds a link of its own.
 */
export function ProtocolRow({
  href,
  icon,
  title,
  category,
  published,
  meta,
  note,
  notice,
}: {
  href: string;
  icon: string;
  title: string;
  category: "safety" | "hygiene" | "waste" | "maintenance" | "other";
  published: boolean;
  meta: ReactNode[];
  note?: ReactNode;
  notice?: ReactNode;
}) {
  return (
    <li className="relative flex items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-accent/40 motion-reduce:transition-none sm:p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <ProtocolIcon name={icon} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Two fixed columns: the status badge always sits at the end of the first line, whatever the title length. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <h3 className="min-w-0 text-sm leading-snug font-semibold text-pretty break-words sm:text-base">
            <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']">
              {title}
            </Link>
          </h3>
          <ProtocolStatusBadge published={published} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <CategoryBadge category={category} />
          <ul className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {meta.map((item, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>·</span>}
                {item}
              </li>
            ))}
          </ul>
        </div>
        {note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
        {notice && (
          <p className="flex items-start gap-1.5 text-xs font-medium text-primary">
            <GitBranchIcon aria-hidden className="mt-px size-3.5 shrink-0" />
            {notice}
          </p>
        )}
      </div>
    </li>
  );
}
