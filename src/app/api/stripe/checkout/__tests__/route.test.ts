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
  PLANS: {
    pro: { name: "Pro", priceId: "price_pro_123", price: 1900 },
    api: { name: "API", priceId: "price_api_123", price: 4900 },
  },
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

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest({ plan: "pro" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("should return 400 if plan is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid plan");
  });

  it("should return 400 if plan is invalid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });

    const res = await POST(makeRequest({ plan: "enterprise" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid plan");
  });

  it("should create a checkout session for valid pro plan", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session-123" });

    const res = await POST(makeRequest({ plan: "pro" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe("https://checkout.stripe.com/session-123");
    expect(mockSessionCreate).toHaveBeenCalledWith({
      mode: "subscription",
      customer_email: "test@example.com",
      line_items: [{ price: "price_pro_123", quantity: 1 }],
      success_url: "http://localhost:3001/pricing?success=true",
      cancel_url: "http://localhost:3001/pricing?canceled=true",
      metadata: { user_id: "user-1", plan: "pro" },
    });
  });

  it("should create a checkout session for valid api plan", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-2", email: "dev@example.com" } },
    });
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session-456" });

    const res = await POST(makeRequest({ plan: "api" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe("https://checkout.stripe.com/session-456");
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_api_123", quantity: 1 }],
        metadata: { user_id: "user-2", plan: "api" },
      })
    );
  });

  it("should pass authorization header to supabase client", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await POST(
      makeRequest({ plan: "pro" }, { authorization: "Bearer token-xyz" })
    );

    // Verify the options object (3rd arg) contains the auth header
    const callArgs = vi.mocked(createClient).mock.calls[0];
    expect(callArgs[2]).toEqual({
      global: { headers: { Authorization: "Bearer token-xyz" } },
    });
  });

  it("should fallback to default baseUrl when origin header is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/s" });

    const req = new NextRequest("http://localhost/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "pro" }),
    });

    await POST(req);

    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://valuscope.com/pricing?success=true",
        cancel_url: "https://valuscope.com/pricing?canceled=true",
      })
    );
  });
});
