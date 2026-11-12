import {
  BarChart3,
  Building2,
  CalendarCheck2,
  FileText,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  MessagesSquare,
  ScanSearch,
  Settings,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Phase de la roadmap où l'écran devient fonctionnel. */
  phase: number;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard, phase: 1 },
  { href: "/candidatures", label: "Mes candidatures", icon: ListChecks, phase: 4 },
  { href: "/analyser", label: "Analyser une offre", icon: ScanSearch, phase: 3 },
  { href: "/entreprises", label: "Explorer les entreprises", icon: Building2, phase: 5 },
  { href: "/reseau", label: "Mon réseau", icon: Users, phase: 5 },
  { href: "/actions", label: "Mes actions", icon: CalendarCheck2, phase: 6 },
  { href: "/cv", label: "Mes CV", icon: FileText, phase: 2 },
  { href: "/entretiens", label: "Mes entretiens", icon: MessagesSquare, phase: 7 },
  { href: "/statistiques", label: "Statistiques", icon: BarChart3, phase: 6 },
  { href: "/parametres", label: "Paramètres", icon: Settings, phase: 1 },
];

export const PROTECTED_PREFIXES = [...NAV_ITEMS.map((i) => i.href), "/onboarding", "/admin"];
export const AUTH_PAGES = ["/connexion", "/inscription", "/mot-de-passe-oublie"];
