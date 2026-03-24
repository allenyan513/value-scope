// Database queries — Data request queue (async provisioning)

import { createServerClient } from "./supabase";

/** Enqueue a ticker for data fetching. Idempotent — increments request_count if already exists. */
export async function enqueueDataRequest(ticker: string): Promise<void> {
  const db = createServerClient();
  const { data } = await db
    .from("data_requests")
    .select("ticker, status")
    .eq("ticker", ticker)
    .single();

  if (!data) {
    // New request
    await db.from("data_requests").insert({ ticker, status: "pending", request_count: 1 });
  } else if (data.status === "failed") {
    // Retry failed request
    await db
      .from("data_requests")
      .update({ status: "pending", error: null, request_count: (data as Record<string, number>).request_count + 1 })
      .eq("ticker", ticker);
  }
  // If pending/processing/completed, do nothing
}

/** Get pending data requests for cron processing. */
export async function getPendingDataRequests(limit = 20): Promise<string[]> {
  const db = createServerClient();
  const { data } = await db
    .from("data_requests")
    .select("ticker")
    .eq("status", "pending")
    .order("requested_at", { ascending: true })
    .limit(limit);
  return (data ?? []).map((r: { ticker: string }) => r.ticker);
}

/** Mark a data request as processing/completed/failed. */
export async function updateDataRequestStatus(
  ticker: string,
  status: "processing" | "completed" | "failed",
  error?: string
): Promise<void> {
  const db = createServerClient();
  await db
    .from("data_requests")
    .update({
      status,
      processed_at: status !== "processing" ? new Date().toISOString() : undefined,
      error: error || null,
    })
    .eq("ticker", ticker);
}
