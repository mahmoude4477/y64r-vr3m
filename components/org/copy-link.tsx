"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/** Copies text to the clipboard; false when the browser refuses (the caller then selects the text). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A read-only link with a copy button (the invitation link fallback when e-mail is off or does not arrive). */
export function CopyLinkField({ id, label, hint, value }: { id: string; label: string; hint?: string; value: string }) {
  const t = useTranslations("org.invitations");
  const actions = useTranslations("common.actions");
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(value)) {
      setCopied(true);
      toast.success(t("copied"));
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      input.current?.select();
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          ref={input}
          id={id}
          readOnly
          value={value}
          dir="ltr"
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="sm" onClick={copy}>
            {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
            {copied ? actions("copied") : actions("copy")}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </div>
  );
}
