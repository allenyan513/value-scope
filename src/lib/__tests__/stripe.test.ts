import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Stripe constructor — must be a class (supports `new`)
vi.mock("stripe", () => {
  const StripeMock = vi.fn(function () {
    return {
      checkout: { sessions: { create: vi.fn() } },
      webhooks: { constructEvent: vi.fn() },
    };
  });
  return { default: StripeMock };
});

describe("stripe.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
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
});
