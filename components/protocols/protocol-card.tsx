import { ListChecksIcon, OctagonAlertIcon, CircleCheckIcon } from "lucide-react";
import type { Locale } from "next-intl";
import { useTranslations } from "next-intl";
import { ProtocolIcon } from "@/components/shared/protocol-icon";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { pick } from "@/lib/i18n-content";
import type { LibraryCard } from "@/lib/protocols/queries";
import { CategoryBadge, OwnProtocolBadge } from "./protocol-badges";

/**
 * One protocol in the library grid. The title is the only link; it stretches over the whole card
 * (after:absolute), so the card is one tap target and screen readers hear one link with the title.
 */
export function ProtocolCard({ card, locale }: { card: LibraryCard; locale: Locale }) {
  const t = useTranslations("protocols.card");
  const title = pick(card, "title", locale);
  return (
    <Card className="relative h-full gap-4 p-4 transition-[box-shadow,background-color] focus-within:ring-2 focus-within:ring-ring hover:bg-accent/40 hover:ring-primary/30 motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ProtocolIcon name={card.icon} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={card.category} />
            {card.own && <OwnProtocolBadge />}
          </div>
          <h2 className="text-base leading-snug font-semibold text-pretty">
            <Link
              href={`/protocols/${card.slug}`}
              className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {title}
            </Link>
          </h2>
        </div>
      </div>
      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{pick(card, "summary", locale)}</p>
      {card.source && (
        <p className="-mt-2 truncate text-xs text-muted-foreground">{t("basedOn", { title: pick(card.source, "title", locale) })}</p>
      )}
      <ul className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <ListChecksIcon aria-hidden className="size-3.5" />
          {t("steps", { count: card.steps.total })}
        </li>
        <li className="flex items-center gap-1.5">
          <CircleCheckIcon aria-hidden className="size-3.5 text-primary" />
          {t("mandatory", { count: card.steps.mandatory })}
        </li>
        {card.steps.critical > 0 && (
          <li className="flex items-center gap-1.5">
            <OctagonAlertIcon aria-hidden className="size-3.5 text-destructive" />
            {t("critical", { count: card.steps.critical })}
          </li>
        )}
      </ul>
    </Card>
  );
}
