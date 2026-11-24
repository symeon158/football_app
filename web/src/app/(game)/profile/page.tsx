import type { Metadata } from "next";
import { Suspense } from "react";

import { ProfileEditor } from "@/components/progression/profile-editor";
import { ProfileView } from "@/components/progression/profile-view";
import { Skeleton } from "@/components/ui/skeleton";
import { getManagerProfile } from "@/lib/data/progression";
import { getViewer } from "@/lib/data/viewer";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] rounded-3xl" />}>
      <ProfileContent />
    </Suspense>
  );
}

async function ProfileContent() {
  const viewer = await getViewer();
  const profile = await getManagerProfile(viewer.username);
  if (!profile) throw new Error("Your profile could not be loaded.");
  return <ProfileView p={profile} editor={<ProfileEditor displayName={profile.display_name ?? profile.username} avatarKey={profile.avatar_key} />} />;
}
