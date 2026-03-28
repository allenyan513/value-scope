import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---
const mockGetUser = vi.fn();
const mockSessionCreate = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: mockSessionCreate } },
  }),
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3001",
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/checkout (credit packs)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest({ pack: "starter_30" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("should return 400 if pack is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid credit pack");
  });

  it("should return 400 if pack is invalid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });

    const res = await POST(makeRequest({ pack: "enterprise" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid credit pack");
  });

  it("should create a one-time payment session for starter pack", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session-123" });

    const res = await POST(makeRequest({ pack: "starter_30" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe("https://checkout.stripe.com/session-123");
    expect(mockSessionCreate).toHaveBeenCalledWith({
      mode: "payment",
      customer_email: "test@example.com",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 2900,
            product_data: {
              name: "ValuScope Starter — 30 Credits",
              description: "Permanently unlock 30 stocks at $0.97/stock",
            },
          },
          quantity: 1,
        },
      ],
      success_url: "http://localhost:3001/pricing?success=true",
      cancel_url: "http://localhost:3001/pricing?canceled=true",
      metadata: { user_id: "user-1", pack_key: "starter_30" },
    });
  });

  it("should create a session for pro pack", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-2", email: "dev@example.com" } },
    });
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session-456" });

    const res = await POST(makeRequest({ pack: "pro_500" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe("https://checkout.stripe.com/session-456");
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 9900 }),
          }),
        ],
        metadata: { user_id: "user-2", pack_key: "pro_500" },
      })
    );
  });

  it("should fallback to default baseUrl when origin header is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/s" });

    const req = new NextRequest("http://localhost/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pack: "trial_5" }),
    });

    await POST(req);

    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://valuescope.dev/pricing?success=true",
        cancel_url: "https://valuescope.dev/pricing?canceled=true",
      })
    );
  });
});
