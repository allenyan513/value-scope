"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, Coins, Eye, LogOut, CreditCard } from "lucide-react";

export function UserMenu() {
  const router = useRouter();
  const { user, session, signOut } = useAuth();
  const [credits, setCredits] = useState<{ remaining: number; total: number } | null>(null);

  useEffect(() => {
    if (!user || !session) return;

    fetch("/api/credits/status", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data) => setCredits({ remaining: data.remaining, total: data.total }))
      .catch(() => {});
  }, [user, session]);

  if (!user) return null;

  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1 rounded-md text-sm hover:bg-accent transition-colors outline-none cursor-pointer">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-6 w-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-6 w-6 rounded-full bg-brand text-brand-foreground flex items-center justify-center text-xs font-medium">
            {initials}
          </div>
        )}
        <span className="hidden sm:inline max-w-[120px] truncate">
          {displayName}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        {/* User info */}
        <div className="px-1.5 py-1.5">
          <p className="text-sm font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>

        <DropdownMenuSeparator />

        {/* Credits */}
        <DropdownMenuItem onClick={() => router.push("/pricing")}>
          <Coins className="mr-2 h-4 w-4" />
          <span>Credits</span>
          {credits && (
            <span className="ml-auto text-xs font-semibold text-brand">
              {credits.remaining}
            </span>
          )}
        </DropdownMenuItem>

        {/* Watchlist */}
        <DropdownMenuItem onClick={() => router.push("/watchlist")}>
          <Eye className="mr-2 h-4 w-4" />
          <span>Watchlist</span>
        </DropdownMenuItem>

        {/* Buy Credits */}
        <DropdownMenuItem onClick={() => router.push("/pricing")}>
          <CreditCard className="mr-2 h-4 w-4" />
          <span>Buy Credits</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Account */}
        <DropdownMenuItem onClick={() => router.push("/account")}>
          <User className="mr-2 h-4 w-4" />
          <span>Account</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Sign out */}
        <DropdownMenuItem variant="destructive" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
