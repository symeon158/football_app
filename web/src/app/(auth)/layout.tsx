import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,oklch(0.74_0.17_152/0.2),transparent_70%)]"
      />
      <Logo className="relative" />
      <div className="relative flex w-full justify-center">{children}</div>
    </main>
  );
}
