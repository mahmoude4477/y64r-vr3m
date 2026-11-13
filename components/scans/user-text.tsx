
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Text people typed (area labels, names, departments, notes), isolated with <bdi> so Arabic and English mix safely.
 * Arabic text gets lang="ar" (screen readers switch voice, WCAG 3.1.2); on English pages the global
 * `[lang="ar"]:not(html)` rule (app/globals.css) then draws it with the Arabic font.
 */
export function UserText({ children, className }: { children: string; className?: string }) {
  const arabic = ARABIC.test(children);
  return (
    <bdi lang={arabic ? "ar" : undefined} className={className}>
      {children}
    </bdi>
  );
}
