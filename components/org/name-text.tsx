import { hasArabicScript } from "@/lib/org/display";
import { cn } from "@/lib/utils";

/**
 * lang="ar" for text with Arabic letters; nothing for other text (it keeps the page's own). On English pages the
 * global `[lang="ar"]:not(html)` rule (app/globals.css) then draws it with IBM Plex Sans Arabic.
 */
export function nameTextProps(text: string): { lang?: "ar" } {
  return hasArabicScript(text) ? { lang: "ar" } : {};
}

/**
 * A name typed by people (member, institution, department) inside text of either language: isolated from the
 * surrounding text (<bdi>: its own direction, the page's alignment) and, when it is Arabic, marked lang="ar". Works in
 * server and client components.
 */
export function NameText({ children, className, title }: { children: string; className?: string; title?: string }) {
  const { lang } = nameTextProps(children);
  return (
    <bdi lang={lang} title={title} className={cn(className) || undefined}>
      {children}
    </bdi>
  );
}
