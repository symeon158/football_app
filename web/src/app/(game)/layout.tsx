import { LogOut } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand/logo";
import { MobileNav } from "@/components/shell/mobile-nav";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { TopBar } from "@/components/shell/top-bar";

/**
 * Responsive game shell: sidebar on large screens, bottom tab bar on phones
 * and tablets. Authentication is enforced per page/loader via requireUserId()
 * (layouts don't re-render on client navigation, so they are not an auth
 * boundary); the proxy redirects anonymous visitors optimistically.
 */
export default function GameLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="stadium-bg flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar/70 px-4 py-5 backdrop-blur lg:flex">
        <Logo href="/dashboard" className="px-2" />
        <div className="mt-8 flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <form action={signOut} className="mb-3">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-4.5" />
            Sign out
          </button>
        </form>
        <p className="px-3 text-[11px] text-muted-foreground">
          All players and clubs are fictional. Coins are earned through play only.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
      </div>

      <MobileNav />
    </div>
  );
}
