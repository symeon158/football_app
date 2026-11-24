"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PlayerCard, type PlayerCardData } from "@/components/game/player-card";
import { buttonVariants } from "@/components/ui/button";
import { RARITIES, RARITY_STYLE } from "@/lib/game/rarity";
import { cn } from "@/lib/utils";

type RevealCard = { ownershipId: string; cardId: string; data: PlayerCardData };

/**
 * Cards start face-down and flip one by one (or all at once). The draw already
 * happened on the server — this is presentation only. Reduced-motion users
 * see every card immediately.
 */
export function PackReveal({ packName, cards }: { packName: string; cards: RevealCard[] }) {
  const [revealed, setRevealed] = useState(0);
  const best = Math.max(...cards.map((c) => RARITIES.indexOf(c.data.rarity)));
  const done = revealed >= cards.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setRevealed(cards.length), 0);
      return () => clearTimeout(t);
    }
  }, [cards.length]);

  const revealNext = () => setRevealed((n) => Math.min(cards.length, n + 1));
  const revealAll = () => {
    // Stagger the remaining flips for a bit of drama.
    for (let i = revealed; i < cards.length; i++) setTimeout(() => setRevealed((n) => Math.max(n, i + 1)), (i - revealed) * 350);
  };

  return (
    <div className="space-y-6">
      <ul className="flex flex-wrap justify-center gap-3 sm:gap-5" aria-live="polite">
        {cards.map((c, i) => {
          const shown = i < revealed;
          const isBest = shown && RARITIES.indexOf(c.data.rarity) === best && best >= 1;
          return (
            <li key={c.ownershipId} className="w-[42%] max-w-48 sm:w-44 [perspective:1000px]">
              <button
                type="button"
                onClick={() => (shown ? undefined : i === revealed ? revealNext() : undefined)}
                disabled={shown || i !== revealed}
                aria-label={shown ? `${c.data.player.first_name} ${c.data.player.last_name}, ${c.data.overall} ${c.data.position}, ${RARITY_STYLE[c.data.rarity].label}` : i === revealed ? "Reveal next card" : "Face-down card"}
                className="relative block aspect-[5/7] w-full rounded-2xl outline-none transition-transform duration-700 [transform-style:preserve-3d] focus-visible:ring-3 focus-visible:ring-ring motion-reduce:transition-none"
                style={{ transform: shown ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                {/* back */}
                <span className={cn(
                  "absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950 shadow-xl [backface-visibility:hidden]",
                  i === revealed && "animate-pulse ring-2 ring-gold/60",
                )}>
                  <svg viewBox="0 0 32 36" aria-hidden className="h-12 w-11">
                    <path d="M16 1 30 6v12c0 9-6.2 14.6-14 17C8.2 32.6 2 27 2 18V6l14-5Z" className="fill-primary/15 stroke-primary" strokeWidth="2" />
                    <path d="m16 9 2.4 4.9 5.4.8-3.9 3.8.9 5.4L16 21.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L16 9Z" className="fill-gold" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-gold/80">{i === revealed ? "Tap to reveal" : packName}</span>
                </span>
                {/* front */}
                <span className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <PlayerCard card={c.data} className={cn(isBest && "shadow-[0_0_40px_-4px] shadow-gold/70")} />
                  {isBest && (
                    <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-gold px-2 py-0.5 text-[10px] font-black uppercase text-black">
                      <Sparkles className="size-3" /> Best pull
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap justify-center gap-3">
        {!done ? (
          <button type="button" onClick={revealAll} className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
            <Sparkles className="size-4" /> Reveal all
          </button>
        ) : (
          <>
            <Link href="/team" className={buttonVariants({ size: "lg" })}>Add to my team</Link>
            <Link href="/marketplace/packs" className={buttonVariants({ size: "lg", variant: "outline" })}>Open another</Link>
            <Link href="/collection?sort=newest" className={buttonVariants({ size: "lg", variant: "ghost" })}>View collection</Link>
          </>
        )}
      </div>
    </div>
  );
}
