"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { RARITY_STYLE } from "@/lib/game/rarity";
import { cn } from "@/lib/utils";
import {
  filtersToQuery,
  POSITIONS,
  RARITY_VALUES,
  SORTS,
  type CollectionFilters as Filters,
} from "@/lib/validation/collection";

type Props = {
  filters: Filters;
  nations: { code: string; name: string; count: number }[];
};

const selectClass =
  "h-10 rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground outline-none transition-colors hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/**
 * Filter bar. State lives in the URL (shareable, back-button friendly) and the
 * server re-renders results. Selects apply instantly; search is debounced.
 * Without JS the same controls submit as a plain GET form.
 */
export function CollectionFilters({ filters, nations }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const [syncedQ, setSyncedQ] = useState(filters.q);
  // URL changed from elsewhere (Clear, rarity chip, back button): adopt it,
  // unless it's just the debounced echo of what is being typed.
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    if (q.trim() !== (filters.q ?? "")) setQ(filters.q ?? "");
  }
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const apply = (patch: Partial<Filters>) => {
    // Any filter change returns to page 1.
    const next = { ...filters, page: 1, ...patch };
    startTransition(() => router.replace(`${pathname}${filtersToQuery(next)}`, { scroll: false }));
  };

  useEffect(() => () => clearTimeout(debounce.current), []);

  const onSearch = (value: string) => {
    setQ(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q: value.trim() || undefined }), 300);
  };

  const active = Boolean(filters.q || filters.position || filters.rarity || filters.nation);

  return (
    <form
      role="search"
      action={pathname}
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: q.trim() || undefined });
      }}
      aria-busy={pending}
      className="flex flex-col gap-3 rounded-2xl border bg-card/70 p-3 backdrop-blur sm:p-4 lg:flex-row lg:items-center"
    >
      <label className="relative flex-1">
        <span className="sr-only">Search players</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          type="search"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name…"
          maxLength={40}
          autoComplete="off"
          className={cn(selectClass, "w-full pl-9")}
        />
      </label>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
        <label>
          <span className="sr-only">Position</span>
          <select name="position" value={filters.position ?? ""} onChange={(e) => apply({ position: (e.target.value || undefined) as Filters["position"] })} className={cn(selectClass, "w-full")}>
            <option value="">All positions</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Rarity</span>
          <select name="rarity" value={filters.rarity ?? ""} onChange={(e) => apply({ rarity: (e.target.value || undefined) as Filters["rarity"] })} className={cn(selectClass, "w-full")}>
            <option value="">All rarities</option>
            {RARITY_VALUES.map((r) => (
              <option key={r} value={r}>{RARITY_STYLE[r].label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Nationality</span>
          <select name="nation" value={filters.nation ?? ""} onChange={(e) => apply({ nation: e.target.value || undefined })} className={cn(selectClass, "w-full")}>
            <option value="">All nations</option>
            {nations.map((n) => (
              <option key={n.code} value={n.code}>{n.name} ({n.count})</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Sort by</span>
          <select name="sort" value={filters.sort} onChange={(e) => apply({ sort: e.target.value as Filters["sort"] })} className={cn(selectClass, "w-full")}>
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <noscript>
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Apply</button>
      </noscript>

      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(`${pathname}${filtersToQuery({ sort: filters.sort })}`, { scroll: false }));
          }}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" /> Clear
        </button>
      )}
    </form>
  );
}
