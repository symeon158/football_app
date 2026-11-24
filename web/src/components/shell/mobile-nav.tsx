"use client";

import { Ellipsis, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/app/(auth)/actions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ACCOUNT_NAV, CURRENT_PHASE, isActive, MAIN_NAV, MOBILE_TABS, navItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Bottom tab bar for phones/tablets (hidden on large screens). */
export function MobileNav() {
  return <MobileNavView pathname={usePathname()} />;
}

/** Hook-free (path-wise) view; with pathname "" it is the static, prerenderable fallback. */
export function MobileNavView({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const tabs = MOBILE_TABS.map(navItem);
  const more = [...MAIN_NAV.filter((i) => !MOBILE_TABS.includes(i.href)), ...ACCOUNT_NAV];
  const moreActive = more.some((i) => isActive(pathname, i.href));

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
    >
      <div className="mx-auto flex max-w-lg">
        {tabs.map(({ href, short, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
              <Icon className="size-5" />
              {short}
            </Link>
          );
        })}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className={tabClass(moreActive)}>
            <Ellipsis className="size-5" />
            More
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <SheetHeader>
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <ul className="grid grid-cols-3 gap-2 px-4">
              {more.map(({ href, label, icon: Icon, phase }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex flex-col items-center gap-2 rounded-xl border bg-card px-2 py-4 text-center text-xs font-medium",
                        active && "border-primary/60 text-primary",
                      )}
                    >
                      <Icon className="size-5" />
                      {label}
                      {phase > CURRENT_PHASE && (
                        <span className="absolute right-1.5 top-1.5 rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
                          Soon
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
              <li>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex w-full flex-col items-center gap-2 rounded-xl border bg-card px-2 py-4 text-xs font-medium text-muted-foreground"
                  >
                    <LogOut className="size-5" />
                    Sign out
                  </button>
                </form>
              </li>
            </ul>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
