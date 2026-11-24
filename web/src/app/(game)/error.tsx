"use client"; // Error boundaries must be Client Components

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Catches unexpected failures in any game page (e.g. a transient database
 * timeout) so the shell stays usable and the player can retry, instead of a
 * blank or half-rendered page. Never shows raw error details to players.
 */
export default function GameError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center" role="alert">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <h1 className="text-xl font-semibold">Something went wrong loading this page</h1>
      <p className="text-sm text-muted-foreground">
        It&apos;s usually temporary. Your coins, cards and squads are safe — nothing was changed.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => retry()} className="gap-2">
          <RotateCcw className="size-4" /> Try again
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Dashboard</Link>
      </div>
    </div>
  );
}
