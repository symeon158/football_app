import type { Metadata } from "next";
import { Suspense } from "react";

import { Challenges, Hero, LatestCards, RecentMatches, StadiumStatus, StatTiles } from "@/components/dashboard/sections";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard } from "@/lib/data/dashboard";
import { getViewer } from "@/lib/data/viewer";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <Suspense>
        <PasswordUpdatedNotice searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function PasswordUpdatedNotice({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  if ((await searchParams).password !== "updated") return null;
  return (
    <p role="status" className="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm sm:mb-6">
      Your password has been updated.
    </p>
  );
}

async function DashboardContent() {
  const viewer = await getViewer(); // authoritative auth check (redirects if signed out)
  const now = new Date();
  const data = await getDashboard(viewer.userId, now);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Hero viewer={viewer} team={data.team} />
      <StatTiles viewer={viewer} data={data} />
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
        <LatestCards cards={data.latestCards} />
        <Challenges challenges={data.challenges} now={now} />
        <RecentMatches matches={data.matches} teamName={data.team?.name} />
        <StadiumStatus stadium={data.stadium} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-label="Loading your club">
      <Skeleton className="h-40 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
        <Skeleton className="h-72 rounded-2xl lg:col-span-8" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-4" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-7" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-5" />
      </div>
    </div>
  );
}
