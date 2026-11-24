import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PlayerNotFound() {
  return (
    <div className="mx-auto max-w-md py-16">
      <EmptyState
        icon={<SearchX className="size-5" />}
        title="Player not found"
        body="That card doesn't exist or is no longer available."
        action={<Link href="/collection" className={cn(buttonVariants({ size: "sm" }), "mt-2")}>Back to collection</Link>}
      />
    </div>
  );
}
