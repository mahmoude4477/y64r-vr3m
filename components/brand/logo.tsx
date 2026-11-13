import { cn } from "@/lib/utils";

/** Waqaya mark: a shield with a check, in the primary teal. Decorative unless `title` is given. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d="M16 2.5 4.5 7v8.2c0 7.1 4.9 12.6 11.5 14.3 6.6-1.7 11.5-7.2 11.5-14.3V7L16 2.5Z"
        className="fill-primary/12 stroke-primary"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m10.5 16.2 3.7 3.7 7.4-7.6"
        className="stroke-primary"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark + wordmark. `name` comes from common.appName so it follows the locale. */
export function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark className="size-7" />
      <span className="text-lg leading-none">{name}</span>
    </span>
  );
}
