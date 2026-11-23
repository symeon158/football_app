import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  { title: "Collect", body: "Open your starter squad and chase Rare, Epic, Legendary and Icon cards." },
  { title: "Build", body: "Pick a formation, drag players into position and tune team chemistry." },
  { title: "Upgrade", body: "Grow your stadium from a 5,000-seat ground into a 70,000-seat cathedral." },
  { title: "Compete", body: "Simulate matches, complete challenges and climb the leaderboards." },
];

export default function LandingPage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {/* floodlight glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(ellipse_at_top,oklch(0.74_0.17_152/0.25),transparent_65%)]"
      />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex gap-2">
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonVariants()}>
            Play free
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-4 py-16 sm:px-6">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-gold">The ultimate football card game</p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Build the club <br className="hidden sm:block" />
            they&apos;ll call <span className="text-primary">legendary</span>.
          </h1>
          <p className="text-lg text-muted-foreground">
            Start with 1,000 Football Coins, a starter squad and your own stadium. Every coin is earned on the
            pitch — no real-money purchases, ever.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "px-6")}>
              Create your club
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "px-6")}>
              I already have one
            </Link>
          </div>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border bg-card/60 p-5 backdrop-blur">
              <h2 className="font-semibold text-gold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
