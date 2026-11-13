import { useFormatter } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * A US-dollar amount (AI cost), always isolated left to right: inside Arabic text "1.13 US$" would otherwise be
 * reordered to "$US 1.13". Totals show cents; a single call (`precise`), or a total under one cent, keeps the four
 * decimals of the "usd" format so a small cost never reads as $0.00.
 */
export function Usd({ value, precise = false, className }: { value: number | null; precise?: boolean; className?: string }) {
  const format = useFormatter();
  if (value === null) return <span className={className}>—</span>;
  const text =
    precise || (value > 0 && value < 0.01)
      ? format.number(value, "usd")
      : format.number(value, { numberingSystem: "latn", style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <bdi dir="ltr" className={cn("tabular-nums", className)}>
      {text}
    </bdi>
  );
}
