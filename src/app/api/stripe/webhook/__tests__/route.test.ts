import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---
const mockConstructEvent = vi.fn();
const mockAddCredits = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
  }),
}));

vi.mock("@/lib/credits", () => ({
  addCredits: (...args: unknown[]) => mockAddCredits(...args),
}));

import { POST } from "../route";

function makeWebhookRequest(body: string, signature = "sig_test") {
  return new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": signature,
      "content-type": "application/json",
    },
    body,
  });
}

describe("POST /api/stripe/webhook (credit system)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("should return 400 if signature is missing", async () => {
    const req = new NextRequest("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("should return 400 if signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const res = await POST(makeWebhookRequest("{}"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Invalid signature");
  });

  it("should add credits on checkout.session.completed", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          customer: "cus_abc",
          metadata: {
            user_id: "user-1",
            pack_key: "starter_30",
          },
        },
      },
    });
    mockAddCredits.mockResolvedValue(undefined);

    const res = await POST(makeWebhookRequest("{}"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
    expect(mockAddCredits).toHaveBeenCalledWith({
      userId: "user-1",
      packKey: "starter_30",
      stripeSessionId: "cs_test_123",
      stripeCustomerId: "cus_abc",
    });
  });

  it("should skip if metadata is missing user_id", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_456",
          customer: "cus_abc",
          metadata: {},
        },
      },
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });

  it("should return 500 if addCredits fails", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_789",
          customer: "cus_abc",
          metadata: { user_id: "user-1", pack_key: "pro_500" },
        },
      },
    });
    mockAddCredits.mockRejectedValue(new Error("DB error"));

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(500);
  });

  it("should ignore non-checkout events", async () => {
    mockConstructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: {} },
    });

    const res = await POST(makeWebhookRequest("{}"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
    expect(mockAddCredits).not.toHaveBeenCalled();
  });
});
