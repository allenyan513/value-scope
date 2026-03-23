import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---
const mockConstructEvent = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
  }),
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    from: () => ({
      upsert: mockUpsert,
      update: mockUpdate,
    }),
  }),
}));

import { POST } from "../route";

function makeWebhookRequest(body: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["stripe-signature"] = signature;
  return new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
    mockUpsert.mockResolvedValue({ data: null, error: null });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });
    mockUpdateEq.mockResolvedValue({ data: null, error: null });
  });

  it("should return 400 if stripe-signature header is missing", async () => {
    const res = await POST(makeWebhookRequest("{}"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("No signature");
  });

  it("should return 400 if signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const res = await POST(makeWebhookRequest("{}", "sig_invalid"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Webhook error: Invalid signature");
  });

  it("should handle non-Error throws in signature verification", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw "string error";
    });

    const res = await POST(makeWebhookRequest("{}", "sig_bad"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Webhook error: Unknown error");
  });

  describe("checkout.session.completed", () => {
    it("should upsert subscription on successful checkout", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { user_id: "user-1", plan: "pro" },
            customer: "cus_abc123",
            subscription: "sub_xyz789",
          },
        },
      });

      const res = await POST(makeWebhookRequest("{}", "sig_valid"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.received).toBe(true);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          plan: "pro",
          stripe_customer_id: "cus_abc123",
          stripe_subscription_id: "sub_xyz789",
          status: "active",
          current_period_end: expect.any(String),
        }),
        { onConflict: "user_id" }
      );
    });

    it("should not upsert if metadata is missing user_id", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { plan: "pro" },
            customer: "cus_abc",
            subscription: "sub_xyz",
          },
        },
      });

      const res = await POST(makeWebhookRequest("{}", "sig_valid"));
      expect(res.status).toBe(200);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("should not upsert if metadata is missing plan", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { user_id: "user-1" },
            customer: "cus_abc",
            subscription: "sub_xyz",
          },
        },
      });

      const res = await POST(makeWebhookRequest("{}", "sig_valid"));
      expect(res.status).toBe(200);
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe("customer.subscription.updated", () => {
    it("should update subscription status and period_end", async () => {
      const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
      mockConstructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_xyz789",
            status: "active",
            items: { data: [{ current_period_end: periodEnd }] },
          },
        },
      });

      const res = await POST(makeWebhookRequest("{}", "sig_valid"));
      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: "active",
        current_period_end: new Date(periodEnd * 1000).toISOString(),
      });
      expect(mockUpdateEq).toHaveBeenCalledWith(
        "stripe_subscription_id",
        "sub_xyz789"
      );
    });

    it("should update status only when period_end is missing", async () => {
      mockConstructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_xyz789",
            status: "past_due",
            items: { data: [] },
          },
        },
      });

      const res = await POST(makeWebhookRequest("{}", "sig_valid"));
      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({ status: "past_due" });
    });
  });

  describe("customer.subscription.deleted", () => {
    it("should set subscription status to canceled", async () => {
      mockConstructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: { id: "sub_canceled_123" },
        },
      });

      const res = await POST(makeWebhookRequest("{}", "sig_valid"));
      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({ status: "canceled" });
      expect(mockUpdateEq).toHaveBeenCalledWith(
        "stripe_subscription_id",
        "sub_canceled_123"
      );
    });
  });

  describe("unhandled events", () => {
    it("should return received:true for unknown event types", async () => {
      mockConstructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: { object: {} },
      });

      const res = await POST(makeWebhookRequest("{}", "sig_valid"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.received).toBe(true);
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
