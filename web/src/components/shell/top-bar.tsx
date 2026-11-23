import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { Coins } from "@/components/game/coins";
import { Skeleton } from "@/components/ui/skeleton";
import { getViewer } from "@/lib/data/viewer";
import { levelProgress } from "@/lib/game/progression";

import { UserMenu } from "./user-menu";

async function ViewerStatus() {
  const viewer = await getViewer();
  const progress = levelProgress(viewer.xp, viewer.level);
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className="hidden min-w-32 sm:block" title={`${viewer.xp} XP`}>
        <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
          <span>Level {viewer.level}</span>
          {!progress.isMax && <span>{progress.percent}%</span>}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-300" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
      <div className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm text-gold">
        <Coins amount={viewer.balance} short />
      </div>
      <UserMenu name={viewer.displayName} username={viewer.username} level={viewer.level} />
    </div>
  );
}

function ViewerStatusSkeleton() {
  return (
    <div className="flex items-center gap-4" aria-hidden>
      <Skeleton className="hidden h-6 w-32 sm:block" />
      <Skeleton className="h-8 w-20 rounded-full" />
      <Skeleton className="size-9 rounded-full" />
    </div>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/75 backdrop-blur-lg">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo href="/dashboard" className="lg:hidden" />
        <div className="hidden lg:block" />
        <Suspense fallback={<ViewerStatusSkeleton />}>
          <ViewerStatus />
        </Suspense>
      </div>
    </header>
  );
}
