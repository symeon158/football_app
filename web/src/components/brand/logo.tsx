import Link from "next/link";

import { cn } from "@/lib/utils";

/** Original Football Legends wordmark with a simple shield crest. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 36" aria-hidden className="h-8 w-7">
        <path d="M16 1 30 6v12c0 9-6.2 14.6-14 17C8.2 32.6 2 27 2 18V6l14-5Z" className="fill-primary/15 stroke-primary" strokeWidth="2" />
        <path d="m16 9 2.4 4.9 5.4.8-3.9 3.8.9 5.4L16 21.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L16 9Z" className="fill-gold" />
      </svg>
      <span className="text-lg">
        Football <span className="text-gold">Legends</span>
      </span>
    </Link>
  );
}
