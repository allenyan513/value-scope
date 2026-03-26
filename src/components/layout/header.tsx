"use client";

import Link from "next/link";
import { TickerSearch } from "@/components/ticker-search";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user, loading, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b bg-card">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-0.5 font-bold text-lg tracking-tight">
          <span className="text-brand">Valu</span>
          <span className="text-foreground">Scope</span>
        </Link>

        <div className="hidden sm:block w-80">
          <TickerSearch />
        </div>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/methodology" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">
            Methodology
          </Link>
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">
            Pricing
          </Link>

          {!loading && (
            <>
              {user ? (
                <>
                  <Link href="/watchlist" className="text-muted-foreground hover:text-foreground transition-colors">
                    Watchlist
                  </Link>
                  <Button variant="ghost" size="sm" onClick={signOut}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <Link href="/auth/login">
                  <Button variant="outline" size="sm">
                    Sign In
                  </Button>
                </Link>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
