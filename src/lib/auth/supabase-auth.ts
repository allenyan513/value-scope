import { createClient } from "@supabase/supabase-js";
import { createBrowserClient as createClientBrowser } from "@supabase/ssr";

// Auth-aware browser client using @supabase/ssr for cookie-based session
export function createAuthBrowserClient() {
  return createClientBrowser(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Server-side auth client (for API routes / server components) — no cookie handling
export function createAuthServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
