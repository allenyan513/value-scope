"use client";

import Link from "next/link";
import { TickerSearch } from "@/components/ticker-search";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-primary">Valu</span>
          <span>Scope</span>
        </Link>

        <div className="hidden sm:block w-80">
          <TickerSearch />
        </div>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/methodology" className="text-muted-foreground hover:text-foreground transition-colors">
            Methodology
          </Link>
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">
            Pricing
          </Link>
        </nav>
      </div>
    </header>
  );
}
