import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Stripe constructor — must be a class (supports `new`)
vi.mock("stripe", () => {
  const StripeMock = vi.fn(function () {
    return {
      checkout: { sessions: { create: vi.fn() } },
      billingPortal: { sessions: { create: vi.fn() } },
      webhooks: { constructEvent: vi.fn() },
    };
  });
  return { default: StripeMock };
});

describe("stripe.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_123";
    process.env.STRIPE_API_PRICE_ID = "price_api_123";
  });

  describe("getStripe", () => {
    it("should create a Stripe instance with the secret key", async () => {
      const { getStripe } = await import("../stripe");
      const stripe = getStripe();
      expect(stripe).toBeDefined();
    });

    it("should return the same instance on subsequent calls (singleton)", async () => {
      const { getStripe } = await import("../stripe");
      const a = getStripe();
      const b = getStripe();
      expect(a).toBe(b);
    });

    it("should throw if STRIPE_SECRET_KEY is not set", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const { getStripe } = await import("../stripe");
      expect(() => getStripe()).toThrow("STRIPE_SECRET_KEY is not set");
    });
  });

  describe("PLANS", () => {
    it("should define pro and api plans", async () => {
      const { PLANS } = await import("../stripe");
      expect(PLANS.pro).toBeDefined();
      expect(PLANS.api).toBeDefined();
    });

    it("should have correct pro plan structure", async () => {
      const { PLANS } = await import("../stripe");
      expect(PLANS.pro.name).toBe("Pro");
      expect(PLANS.pro.price).toBe(1900);
      expect(PLANS.pro.priceId).toBe("price_pro_123");
    });

    it("should have correct api plan structure", async () => {
      const { PLANS } = await import("../stripe");
      expect(PLANS.api.name).toBe("API");
      expect(PLANS.api.price).toBe(4900);
      expect(PLANS.api.priceId).toBe("price_api_123");
    });
  });

  describe("PlanKey", () => {
    it("should only allow 'pro' and 'api' as valid keys", async () => {
      const { PLANS } = await import("../stripe");
      const keys = Object.keys(PLANS);
      expect(keys).toEqual(["pro", "api"]);
    });
  });
});
