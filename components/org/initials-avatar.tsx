import { Building2Icon, UserRoundIcon } from "lucide-react";
import { initialsOf } from "@/lib/org/initials";
import { cn } from "@/lib/utils";

/**
 * Initials in a circle (members) or a rounded square (institutions). Decorative: the name is always written next to
 * it, so it is hidden from screen readers. No images: nothing to upload and nothing extra for the CSP.
 */
export function InitialsAvatar({
  name,
  kind = "person",
  size = "md",
  className,
}: {
  name: string;
  kind?: "person" | "organization";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const initials = initialsOf(name);
  const Fallback = kind === "organization" ? Building2Icon : UserRoundIcon;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold select-none",
        kind === "organization" ? "rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20" : "rounded-full bg-muted text-muted-foreground ring-1 ring-border",
        size === "sm" && "size-7 text-[0.7rem]",
        size === "md" && "size-9 text-xs",
        size === "lg" && "size-12 text-sm",
        size === "xl" && "size-16 text-lg",
        className,
      )}
    >
      {initials || <Fallback className="size-1/2" />}
    </span>
  );
}
