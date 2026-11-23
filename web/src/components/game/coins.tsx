import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Original Football Coin glyph. */
export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-4 shrink-0", className)}>
      <circle cx="12" cy="12" r="10.5" className="fill-gold" />
      <circle cx="12" cy="12" r="8" className="fill-none stroke-black/25" strokeWidth="1.2" />
      <path d="M9.2 7.5h6M9.2 7.5v9M9.2 11.8h4.4" className="stroke-black/70" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Coins({ amount, className, short }: { amount: number; className?: string; short?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold tabular-nums", className)}>
      <CoinIcon />
      {formatCoins(amount, short)}
      <span className="sr-only">Football Coins</span>
    </span>
  );
}
