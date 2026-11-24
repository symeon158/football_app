import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Coins } from "@/components/game/coins";
import { MarketHeader } from "@/components/market/market-tabs";
import { OpenPackButton } from "@/components/market/purchase-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import { getPacks } from "@/lib/data/market";
import { getViewer } from "@/lib/data/viewer";
import { RARITIES, RARITY_STYLE } from "@/lib/game/rarity";
import { cn } from "@/lib/utils";
import { formatOdds } from "@/lib/validation/market";

export const metadata: Metadata = { title: "Card packs" };

const PACK_ART: Record<string, string> = {
  bronze: "from-orange-700 via-amber-800 to-stone-900",
  silver: "from-slate-300 via-slate-500 to-slate-800",
  gold: "from-yellow-300 via-amber-500 to-amber-800",
};

export default function PacksPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Suspense fallback={<Skeleton className="h-[32rem] rounded-2xl" />}>
        <PacksContent />
      </Suspense>
    </div>
  );
}

async function PacksContent() {
  const viewer = await getViewer();
  const packs = await getPacks(viewer.userId, new Date());

  return (
    <>
      <MarketHeader active="/marketplace/packs" balance={viewer.balance} />
      <ul className="grid gap-4 md:grid-cols-3">
        {packs.map((p) => {
          const odds = RARITIES.map((r) => ({ rarity: r, weight: p.card_pack_odds.find((o) => o.rarity === r)?.weight ?? 0 }));
          const remaining = p.daily_limit - p.openedToday;
          return (
            <li key={p.id} className="flex flex-col rounded-2xl border bg-card/70 p-4 backdrop-blur">
              <div className={cn("relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br shadow-inner", PACK_ART[p.code] ?? "from-emerald-700 to-slate-900")}>
                <div aria-hidden className="absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.35)_50%,transparent_65%)]" />
                <div className="relative text-center text-white drop-shadow">
                  <p className="text-2xl font-black uppercase tracking-wider">{p.name.replace(" Pack", "")}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] opacity-80">{p.cards_per_pack} cards</p>
                </div>
              </div>

              <div className="mt-4 flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{p.name}</h2>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                </div>
                <Coins amount={p.price} className="shrink-0 text-lg text-gold" />
              </div>

              {p.guaranteed_rarity && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary">
                  <ShieldCheck className="size-3.5" /> Guaranteed: at least one {RARITY_STYLE[p.guaranteed_rarity].label} or better
                </p>
              )}

              {/* Published odds — the same table the server draws from */}
              <table className="mt-3 w-full text-sm">
                <caption className="mb-1 text-left text-xs font-medium text-muted-foreground">Odds per card</caption>
                <tbody>
                  {odds.map((o) => (
                    <tr key={o.rarity} className={cn(o.weight === 0 && "opacity-40")}>
                      <th scope="row" className="py-0.5 text-left font-normal">
                        <span className={cn("inline-block rounded-full px-2 py-px text-[11px] font-semibold ring-1", RARITY_STYLE[o.rarity].chip)}>{RARITY_STYLE[o.rarity].label}</span>
                      </th>
                      <td className="py-0.5 text-right tabular-nums">{formatOdds(o.weight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-auto space-y-2 pt-4">
                <OpenPackButton packId={p.id} name={p.name} price={p.price} balance={viewer.balance} remainingToday={remaining} />
                <p className="text-center text-[11px] text-muted-foreground">Opened today: {p.openedToday} of {p.daily_limit}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Each card&apos;s rarity is drawn independently using the odds shown; a pack&apos;s guarantee applies to its first card.
        Daily limits reset at midnight UTC.
      </p>
    </>
  );
}
