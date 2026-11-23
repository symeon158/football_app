import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Collection" };

export default function Page() {
  return <ComingSoon href="/collection" />;
}
