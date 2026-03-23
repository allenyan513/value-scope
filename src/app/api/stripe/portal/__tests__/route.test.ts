import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---
const mockGetUser = vi.fn();
const mockPortalCreate = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: () => ({
      select: mockSelect,
    }),
  }),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    billingPortal: { sessions: { create: mockPortalCreate } },
  }),
}));

import { POST } from "../route";

function makeRequest(headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/stripe/portal", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3001",
      ...(headers || {}),
    },
  });
}

describe("POST /api/stripe/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
  });

  it("should return 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("should return 404 if no subscription found", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });
    mockSingle.mockResolvedValue({ data: null });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("No active subscription");
  });

  it("should return 404 if subscription has no stripe_customer_id", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });
    mockSingle.mockResolvedValue({ data: { stripe_customer_id: null } });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("No active subscription");
  });

  it("should create a billing portal session with correct params", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
    });
    mockSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_abc123" },
    });
    mockPortalCreate.mockResolvedValue({
      url: "https://billing.stripe.com/portal-session",
    });

    const res = await POST(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe("https://billing.stripe.com/portal-session");
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: "cus_abc123",
      return_url: "http://localhost:3001/pricing",
    });
  });

  it("should query subscriptions for the correct user_id", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-42", email: "test@example.com" } },
    });
    mockSingle.mockResolvedValue({ data: null });

    await POST(makeRequest());

    expect(mockSelect).toHaveBeenCalledWith("stripe_customer_id");
    expect(mockEq).toHaveBeenCalledWith("user_id", "user-42");
  });
});
