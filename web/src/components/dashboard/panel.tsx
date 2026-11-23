import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Panel({
  title,
  href,
  linkLabel = "View all",
  className,
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const id = `panel-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("min-w-0 rounded-2xl border bg-card/70 p-4 backdrop-blur sm:p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={id} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {href && (
          <Link href={href} className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-primary">
            {linkLabel}
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function Meter({ value, max, className, barClassName }: { value: number; max: number; className?: string; barClassName?: string }) {
  const pct = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0;
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      <div className={cn("h-full rounded-full bg-primary transition-[width] duration-700", barClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}
