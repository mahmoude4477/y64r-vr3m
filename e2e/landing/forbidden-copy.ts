// TEST-ONLY, and kept OUTSIDE the app's source folders on purpose: what must never appear on the public site
// (PRODUCT.md, 2026-10-28): the deck's award line and placeholder text.
// Next.js only bundles what app code imports, and nothing under app/, components/ or lib/ may import this file
// (lib/landing/copy-guard.test.ts fails if anything does), so the names can never reach a bundle.
//
// Used by lib/landing/copy-guard.test.ts (every message file, both languages) and e2e/landing/landing.spec.ts (the
// rendered page, and the raw HTML / RSC payload / manifest the server sends).

export const FORBIDDEN_COPY: readonly RegExp[] = [
  // The award line and its venue.
  /med[a]thon/i,
  /المركز الثاني/,
  /\b(second|2nd) place\b/i,
  /\baward\b|جائزة/i,
  /الجوف|\bjouf\b/i,
  // Placeholder text.
  /lorem|ipsum/i,
];
