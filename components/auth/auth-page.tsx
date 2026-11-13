import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { isEmailEnabled } from "@/lib/email";

/** Title + description block used by every auth page. */
export function AuthHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Loading state for auth forms (Suspense fallback). */
export function AuthFormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

/** Whether email can be sent, read at request time (not baked into the prerendered shell). */
export async function emailEnabledAtRequest(): Promise<boolean> {
  await connection();
  return isEmailEnabled();
}
