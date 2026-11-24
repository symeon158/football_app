import { Building2, Crown, Flame, Library, Medal, Star, Trophy, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { trophy: Trophy, medal: Medal, flame: Flame, crown: Crown, library: Library, building: Building2, star: Star };

export function BadgeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Trophy;
  return <Icon className={className} aria-hidden />;
}
