import Link from "next/link";
import { cn } from "@/lib/utils";

/** Marque : une flèche de retour stylisée (la relance) + logotype. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 text-emerald">
        <rect width="24" height="24" rx="6" fill="currentColor" />
        <path
          d="M8 15.5V10a3 3 0 0 1 3-3h5.5m0 0L14 4.5M16.5 7 14 9.5"
          fill="none"
          stroke="var(--on-emerald)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-lg">Relance</span>
    </Link>
  );
}
