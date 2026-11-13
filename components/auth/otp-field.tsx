"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import type { Ref } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

/** 6-digit code input. Digits always run left-to-right, also on Arabic pages. */
export function OtpField({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  label,
  autoFocus,
  ref,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  label: string;
  /** Focus the input when it appears (a step that replaces the button the user just pressed). */
  autoFocus?: boolean;
  /** The real <input> (react-hook-form `field.ref`, so `form.setFocus(name)` and focus-on-error reach it). */
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <div dir="ltr" className="flex justify-center">
      <InputOTP
        id={id}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-label={label}
        aria-invalid={invalid}
        autoFocus={autoFocus}
        ref={ref}
      >
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} aria-invalid={invalid} className="size-10 text-base sm:size-11" />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
