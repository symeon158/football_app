import { ArrowLeft, Swords } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ProfileView } from "@/components/progression/profile-view";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getManagerArea, getManagerProfile } from "@/lib/data/progression";
import { getViewer } from "@/lib/data/viewer";
import { usernameSchema } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Manager" };

export default function ManagerPage({ params }: PageProps<"/managers/[username]">) {
  return (
    <div className="space-y-4">
      <Link href="/leaderboards" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Leaderboards
      </Link>
      <Suspense fallback={<Skeleton className="h-[32rem] rounded-3xl" />}>
        <ManagerContent params={params} />
      </Suspense>
    </div>
  );
}

async function ManagerContent({ params }: Pick<PageProps<"/managers/[username]">, "params">) {
  await getViewer();
  const username = decodeURIComponent((await params).username);
  if (!usernameSchema.safeParse(username).success) notFound();
  const [profile, area] = await Promise.all([getManagerProfile(username), getManagerArea(username)]);
  if (!profile) notFound();
  if (profile.is_me) redirect("/profile");
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/matches/challenge/${encodeURIComponent(profile.username)}`} className={buttonVariants({ className: "gap-2" })}>
          <Swords className="size-4" /> Challenge {profile.username}
        </Link>
        {area && <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">📍 {area}</span>}
      </div>
      <ProfileView p={profile} />
    </>
  );
}
