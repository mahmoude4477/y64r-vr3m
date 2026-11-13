import { initialsOf } from "@/lib/admin/initials";
import { cn } from "@/lib/utils";

/** A decorative avatar with the person's initials (the name is always shown as text next to it). */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary", className)}
    >
      {initialsOf(name)}
    </span>
  );
}
