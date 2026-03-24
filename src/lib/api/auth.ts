import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/** Create a Supabase client that forwards the user's auth header */
export function createSupabaseWithAuth(request: NextRequest): SupabaseClient {
  const authHeader = request.headers.get("authorization");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    }
  );
}

/**
 * Authenticate request and return user + supabase client.
 * Returns a 401 NextResponse if not authenticated.
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<{ user: User; supabase: SupabaseClient } | NextResponse> {
  const supabase = createSupabaseWithAuth(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user, supabase };
}
