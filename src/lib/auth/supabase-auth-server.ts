import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * SSR-aware server client with cookie read/write support.
 * Used in auth callback route to persist session to cookies.
 *
 * IMPORTANT: This file imports next/headers — only use in Server Components
 * and Route Handlers, never in Client Components.
 */
export async function createCookieClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can fail in Server Components (read-only).
            // Fine — only matters in Route Handlers and Server Actions.
          }
        },
      },
    }
  );
}
