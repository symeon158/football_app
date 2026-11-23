import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { navItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Placeholder for screens delivered in later roadmap phases. */
export function ComingSoon({ href }: { href: string }) {
  const { label, icon: Icon, description, phase } = navItem(href);
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border bg-card/70 p-8 text-center backdrop-blur">
        <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative mx-auto flex size-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
          <Icon className="size-7" />
        </div>
        <h1 className="relative mt-5 text-2xl font-bold tracking-tight">{label}</h1>
        <p className="relative mt-2 text-muted-foreground">{description}</p>
        <p className="relative mt-4 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Coming soon · roadmap phase {phase}
        </p>
        <div className="relative mt-6">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
