"use client";

import { LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { useRouter } from "@/i18n/navigation";
import { cleanQuery, libraryHref, MAX_QUERY_LENGTH, type ProtocolCategoryValue } from "@/lib/protocols/search";

const DEBOUNCE_MS = 300;

/**
 * Search box of the protocol library. The URL (?q=) is the source of truth: typing updates it after a short
 * pause (router.replace, no new history entry), Enter updates it at once, and without JavaScript the form is
 * a plain GET form. The server filters and renders the results.
 */
export function LibrarySearch({ q, category }: { q: string; category: ProtocolCategoryValue | null }) {
  const t = useTranslations("protocols.library");
  const locale = useLocale();
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  // The URL can change without us (back/forward, "clear filters"): follow it unless it is the text we sent.
  const [seenQ, setSeenQ] = useState(q);
  const [sentQ, setSentQ] = useState<string | null>(null);
  if (q !== seenQ) {
    setSeenQ(q);
    if (q !== sentQ) setValue(q);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function navigate(text: string) {
    clearTimeout(timer.current);
    const next = cleanQuery(text);
    setSentQ(next);
    startTransition(() => {
      router.replace(libraryHref({ category, q: next }), { scroll: false });
    });
  }

  return (
    <form
      role="search"
      action={`/${locale}/protocols`}
      method="get"
      className="w-full sm:max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(value);
      }}
    >
      {category && <input type="hidden" name="category" value={category} />}
      <Field>
        <FieldLabel htmlFor="protocol-search" className="sr-only">
          {t("searchLabel")}
        </FieldLabel>
        <InputGroup className="h-10">
          <InputGroupAddon>
            {pending ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <SearchIcon aria-hidden />}
          </InputGroupAddon>
          <InputGroupInput
            ref={input}
            id="protocol-search"
            type="search"
            name="q"
            value={value}
            maxLength={MAX_QUERY_LENGTH}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
            enterKeyHint="search"
            className="[&::-webkit-search-cancel-button]:appearance-none"
            onChange={(event) => {
              const text = event.target.value;
              setValue(text);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => navigate(text), DEBOUNCE_MS);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && value) {
                event.preventDefault();
                setValue("");
                navigate("");
              }
            }}
          />
          {value && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-sm"
                aria-label={t("clearSearch")}
                onClick={() => {
                  setValue("");
                  navigate("");
                  input.current?.focus();
                }}
              >
                <XIcon aria-hidden />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </Field>
    </form>
  );
}
