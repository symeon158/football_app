import {
  Building2,
  ChartColumn,
  Layers,
  LayoutDashboard,
  Settings,
  Shield,
  Store,
  Swords,
  Target,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  short: string; // label for the mobile tab bar
  icon: LucideIcon;
  phase: number; // roadmap phase that delivers the screen
  description: string;
};

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, phase: 2, description: "Your club at a glance." },
  { href: "/club", label: "My Club", short: "Club", icon: Shield, phase: 4, description: "Club identity, crest, colours and squads." },
  { href: "/collection", label: "Collection", short: "Cards", icon: Layers, phase: 3, description: "Browse, filter and inspect every card you own." },
  { href: "/team", label: "Team Builder", short: "Team", icon: Users, phase: 4, description: "Pick a formation, drag players into position and choose a captain." },
  { href: "/stadium", label: "Stadium", short: "Stadium", icon: Building2, phase: 6, description: "Upgrade seating, lighting, pitch and facilities." },
  { href: "/marketplace", label: "Marketplace", short: "Market", icon: Store, phase: 5, description: "Buy players and open packs with transparent odds." },
  { href: "/matches", label: "Match Centre", short: "Match", icon: Swords, phase: 7, description: "Pick tactics, kick off and follow the action live." },
  { href: "/challenges", label: "Challenges", short: "Goals", icon: Target, phase: 8, description: "Daily, weekly and team-building challenges." },
  { href: "/leaderboards", label: "Leaderboards", short: "Ranks", icon: ChartColumn, phase: 8, description: "See how your club ranks against other managers." },
];

export const ACCOUNT_NAV: NavItem[] = [
  { href: "/profile", label: "Profile", short: "Profile", icon: User, phase: 8, description: "Your manager profile, badges and stats." },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, phase: 9, description: "Account and display preferences." },
];

/** Tabs shown in the mobile bottom bar; everything else lives under "More". */
export const MOBILE_TABS = ["/dashboard", "/collection", "/team", "/matches"];

export const CURRENT_PHASE = 4;

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navItem(href: string): NavItem {
  const item = [...MAIN_NAV, ...ACCOUNT_NAV].find((i) => i.href === href);
  if (!item) throw new Error(`Unknown nav item ${href}`);
  return item;
}
