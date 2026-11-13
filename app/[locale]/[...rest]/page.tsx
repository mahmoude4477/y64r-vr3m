import { notFound } from "next/navigation";

// Sends unmatched /ar/* and /en/* URLs to the localized app/[locale]/not-found.tsx.
// Opt out of dev instant-navigation validation: this segment always throws notFound() by design.
export const instant = false;

export default function CatchAll() {
  notFound();
}
