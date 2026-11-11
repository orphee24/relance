"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/config/navigation";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "./theme-toggle";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

interface SidebarProps {
  displayName: string;
  email: string;
  planLabel: string;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="grid gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-sunken hover:text-ink",
                active && "bg-emerald-wash font-medium text-ink hover:bg-emerald-wash",
              )}
            >
              {active ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-emerald" /> : null}
              <Icon className={cn("size-4 shrink-0", active && "text-emerald")} aria-hidden="true" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function AccountBlock({ displayName, email, planLabel }: SidebarProps) {
  return (
    <div className="grid gap-3 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-2">
        <ThemeToggle />
        <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">{planLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-wash text-sm font-semibold text-emerald"
        >
          {displayName.charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted">{email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="grid size-8 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Mobile */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur lg:hidden">
        <Logo href="/tableau-de-bord" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-9 place-items-center rounded-control text-muted hover:bg-sunken"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          aria-controls="menu-mobile"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="menu-mobile">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Fermer le menu" onClick={() => setOpen(false)} />
          <nav className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-surface p-4">
            <div className="flex items-center justify-between">
              <Logo href="/tableau-de-bord" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-control text-muted hover:bg-sunken"
                aria-label="Fermer le menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            <AccountBlock {...props} />
          </nav>
        </div>
      ) : null}

      {/* Desktop */}
      <nav
        aria-label="Navigation principale"
        className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-3 py-5 lg:flex"
      >
        <Logo href="/tableau-de-bord" className="px-3" />
        <div className="flex-1">
          <NavList />
        </div>
        <AccountBlock {...props} />
      </nav>
    </>
  );
}
