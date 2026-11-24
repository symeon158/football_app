import { shortName } from "@/lib/format";
import { GK_STAT_LABELS, OUTFIELD_STAT_LABELS, RARITY_STYLE, type Rarity } from "@/lib/game/rarity";
import { cn } from "@/lib/utils";

import { PlayerFace } from "./player-face";

export type PlayerCardData = {
  rarity: Rarity;
  position: string;
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physicality: number;
  player: { first_name: string; last_name: string; known_as?: string | null; nationality: string; club: string };
};

/**
 * Collectible card face. Pure server-renderable markup; hover effects are CSS
 * only and disabled for users who prefer reduced motion.
 */
export function PlayerCard({ card, className, captain }: { card: PlayerCardData; className?: string; captain?: boolean }) {
  const style = RARITY_STYLE[card.rarity];
  const labels = card.position === "GK" ? GK_STAT_LABELS : OUTFIELD_STAT_LABELS;
  const values = [card.pace, card.shooting, card.passing, card.dribbling, card.defending, card.physicality];
  const name = shortName(card.player);

  return (
    <article
      aria-label={`${name}, ${card.overall} rated ${card.position}, ${style.label}`}
      className={cn(
        "group @container relative aspect-[5/7] w-full rounded-2xl bg-gradient-to-br p-[2px] shadow-lg shadow-black/40 transition duration-300",
        "motion-safe:hover:-translate-y-1 hover:shadow-xl",
        style.frame,
        style.glow,
        className,
      )}
    >
      <div className={cn("relative flex h-full flex-col overflow-hidden rounded-[14px] bg-gradient-to-b", style.face, style.ink)}>
        {/* metallic sheen */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.28)_50%,transparent_65%)] transition-transform duration-700 motion-safe:group-hover:translate-x-full"
        />
        {/* pitch-line watermark */}
        <svg aria-hidden viewBox="0 0 100 140" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]">
          <circle cx="50" cy="62" r="26" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M0 62h100" stroke="currentColor" strokeWidth="1.5" />
        </svg>

        <header className="relative flex items-start justify-between px-[8%] pt-[7%]">
          <div className="leading-none">
            <p className="text-[clamp(1.25rem,18cqw,2.25rem)] font-black tabular-nums tracking-tight">{card.overall}</p>
            <p className={cn("mt-0.5 text-[clamp(0.6rem,8cqw,0.85rem)] font-bold tracking-wider", style.accent)}>{card.position}</p>
            <p className={cn("mt-1 text-[clamp(0.55rem,6.5cqw,0.75rem)] font-semibold", style.accent)}>{card.player.nationality}</p>
          </div>
          {captain && (
            <span className="rounded-md bg-gold px-1.5 py-0.5 text-[0.6rem] font-black text-black" title="Captain">
              C
            </span>
          )}
        </header>

        {/* original generated portrait (fictional players only — real likenesses need licences) */}
        <PlayerFace
          seed={`${card.player.first_name} ${card.player.last_name}`}
          className="relative mx-auto -mt-[9%] h-[46%] w-auto drop-shadow-[0_6px_8px_rgb(0_0_0/0.35)]"
        />

        <div className="relative mt-auto px-[9%] pb-[8%]">
          <p className="truncate border-b border-current/20 pb-1 text-center text-[clamp(0.7rem,9cqw,0.95rem)] font-bold">
            {name}
          </p>
          {/* two columns of three, like a printed card: PAC/SHO/PAS | DRI/DEF/PHY */}
          <dl className="mt-1.5 grid grid-flow-col grid-cols-2 grid-rows-3 gap-x-[10%] gap-y-0.5 pl-[8%]">
            {labels.map((label, i) => (
              <div key={label} className="flex items-baseline gap-1">
                <dt className={cn("order-2 text-[clamp(0.5rem,6cqw,0.7rem)] font-semibold", style.accent)}>{label}</dt>
                <dd className="order-1 text-[clamp(0.65rem,8cqw,0.9rem)] font-bold tabular-nums">{values[i]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </article>
  );
}
