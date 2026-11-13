import {
  BookOpenCheckIcon,
  BrushCleaningIcon,
  DropletsIcon,
  FlaskConicalIcon,
  HandIcon,
  type LucideIcon,
  type LucideProps,
  SyringeIcon,
  Trash2Icon,
  UtensilsCrossedIcon,
  WrenchIcon,
} from "lucide-react";

/**
 * Protocol.icon stores a lucide icon name (kebab-case). Only the names below are bundled; unknown
 * names fall back to a generic icon. Add new names here (foundation file: ask) when content needs them.
 */
export const PROTOCOL_ICONS: Record<string, LucideIcon> = {
  syringe: SyringeIcon,
  "trash-2": Trash2Icon,
  droplets: DropletsIcon,
  "brush-cleaning": BrushCleaningIcon,
  hand: HandIcon,
  "flask-conical": FlaskConicalIcon,
  "utensils-crossed": UtensilsCrossedIcon,
  wrench: WrenchIcon,
  "book-open-check": BookOpenCheckIcon,
};

export function ProtocolIcon({ name, ...props }: { name: string | null | undefined } & LucideProps) {
  const Icon = (name && PROTOCOL_ICONS[name]) || BookOpenCheckIcon;
  return <Icon aria-hidden {...props} />;
}
