import { History, PackageOpen, Users } from "lucide-react";
import Link from "next/link";

import { Coins } from "@/components/game/coins";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/marketplace", label: "Players", icon: Users },
  { href: "/marketplace/packs", label: "Packs", icon: PackageOpen },
  { href: "/marketplace/history", label: "Coin history", icon: History },
] as const;

/** Header + tabs shared by the marketplace pages (server-rendered, active tab passed in). */
export function MarketHeader({ active, balance }: { active: (typeof TABS)[number]["href"]; balance?: number }) {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Marketplace</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Transfer market</h1>
        </div>
        {balance !== undefined && (
          <div className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Your balance</p>
            <Coins amount={balance} className="text-lg text-gold" />
          </div>
        )}
      </header>
      <nav aria-label="Marketplace sections" className="flex gap-1 rounded-xl border bg-card/60 p-1 backdrop-blur sm:w-fit">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active === href ? "page" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none",
              active === href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground">
        Football Coins are earned by playing — they can&apos;t be bought with real money. Pack odds are always shown in full.
      </p>
    </div>
  );
}
