import { Avatar } from "@/components/game/avatar";
import { Coins } from "@/components/game/coins";
import { Crest } from "@/components/game/crest";
import { Panel } from "@/components/dashboard/panel";
import type { ManagerProfile } from "@/lib/data/progression";
import { formatNumber } from "@/lib/format";
import { levelProgress } from "@/lib/game/progression";

import { BadgeIcon } from "./badge-icon";

const dateFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Public manager profile (shared by /profile and /managers/[username]). */
export function ProfileView({ p, editor }: { p: ManagerProfile; editor?: React.ReactNode }) {
  const progress = levelProgress(p.xp, p.level);
  const winRate = p.played ? Math.round((p.won / p.played) * 100) : 0;
  const stats = [
    { label: "Matches", value: formatNumber(p.played) },
    { label: "W–D–L", value: `${p.won}–${p.drawn}–${p.lost}` },
    { label: "Win rate", value: `${winRate}%` },
    { label: "Goals", value: formatNumber(p.goals) },
    { label: "Cards", value: formatNumber(p.cards) },
    { label: "Club value", value: <Coins amount={p.club_value} short /> },
    { label: "Best team rating", value: p.best_team_rating },
    { label: "Stadium", value: p.stadium ? `Level ${p.stadium.level}` : "—" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="flex flex-col gap-5 rounded-3xl border bg-gradient-to-br from-emerald-950/70 via-card to-card p-5 sm:flex-row sm:items-center sm:p-7">
        <Avatar avatarKey={p.avatar_key} name={p.display_name ?? p.username} className="size-20" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{p.display_name ?? p.username}</h1>
          <p className="text-sm text-muted-foreground">@{p.username} · Manager since {dateFmt.format(new Date(p.member_since))}</p>
          <div className="mt-3 max-w-sm">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Level {p.level}</span>
              <span>{progress.isMax ? "Max level" : `${formatNumber(progress.xpIntoLevel)} / ${formatNumber(progress.xpForNextLevel)} XP`}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-300" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </div>
        {p.team && (
          <div className="flex items-center gap-3 rounded-2xl border bg-background/40 px-4 py-3">
            <Crest template={p.team.logo_template} primary={p.team.primary_color} secondary={p.team.secondary_color} name={p.team.name} className="size-12" />
            <div>
              <p className="font-semibold">{p.team.name}</p>
              <p className="text-xs text-muted-foreground">{p.team.formation} · Rating {p.team.overall}</p>
            </div>
          </div>
        )}
      </section>

      {editor}

      <section aria-label="Statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card/70 p-4 backdrop-blur">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-xl font-bold">{s.value}</p>
          </div>
        ))}
      </section>

      <Panel title={`Badges (${p.badges.length})`}>
        {p.badges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No badges yet — earn them from achievements.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {p.badges.map((b) => (
              <li key={b.code} className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 py-1 pl-1 pr-3 text-sm">
                <span className="flex size-7 items-center justify-center rounded-full bg-gold text-black"><BadgeIcon name={b.badge_icon} className="size-4" /></span>
                {b.title}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
