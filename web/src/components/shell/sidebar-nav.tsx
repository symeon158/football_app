"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CURRENT_PHASE, isActive, MAIN_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Reads the current path (request-time data on dynamic routes — render inside <Suspense>). */
export function SidebarNav() {
  return <SidebarNavView pathname={usePathname()} />;
}

/** Hook-free view; with pathname "" it is the static, prerenderable fallback. */
export function SidebarNavView({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {MAIN_NAV.map(({ href, label, icon: Icon, phase }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-foreground",
              active && "bg-primary/10 text-foreground",
            )}
          >
            {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-primary" />}
            <Icon className={cn("size-4.5", active ? "text-primary" : "group-hover:text-foreground")} />
            <span className="flex-1">{label}</span>
            {phase > CURRENT_PHASE && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
