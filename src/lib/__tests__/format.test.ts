import { describe, it, expect } from "vitest";
import {
  formatLargeNumber,
  formatCurrency,
  formatMillions,
  getUpsideColor,
  toDateString,
} from "../format";

describe("formatLargeNumber", () => {
  it("should format trillions", () => {
    expect(formatLargeNumber(3.5e12)).toBe("$3.5T");
    expect(formatLargeNumber(1e12)).toBe("$1.0T");
  });

  it("should format billions", () => {
    expect(formatLargeNumber(2.4e9)).toBe("$2.4B");
    expect(formatLargeNumber(100e9)).toBe("$100.0B");
  });

  it("should format millions", () => {
    expect(formatLargeNumber(5.5e6)).toBe("$5.5M");
    expect(formatLargeNumber(123e6)).toBe("$123.0M");
  });

  it("should format thousands when includeK is true", () => {
    expect(formatLargeNumber(50_000, { includeK: true })).toBe("$50.0K");
    expect(formatLargeNumber(1_500, { includeK: true })).toBe("$1.5K");
  });

  it("should not format thousands when includeK is false (default)", () => {
    const result = formatLargeNumber(50_000);
    expect(result).toBe("$50,000");
  });

  it("should respect custom prefix", () => {
    expect(formatLargeNumber(1e9, { prefix: "" })).toBe("1.0B");
    expect(formatLargeNumber(1e9, { prefix: "€" })).toBe("€1.0B");
  });

  it("should respect custom decimals", () => {
    expect(formatLargeNumber(1.234e9, { decimals: 2 })).toBe("$1.23B");
    expect(formatLargeNumber(1.5e12, { decimals: 0 })).toBe("$2T");
  });

  it("should handle negative numbers", () => {
    expect(formatLargeNumber(-2.5e9)).toBe("$-2.5B");
    expect(formatLargeNumber(-500e6)).toBe("$-500.0M");
  });

  it("should handle small numbers without abbreviation", () => {
    const result = formatLargeNumber(999);
    expect(result).toBe("$999");
  });
});

describe("formatCurrency", () => {
  it("should format as USD with 2 decimal places", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("should handle zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("should handle negative values", () => {
    expect(formatCurrency(-50.5)).toBe("-$50.50");
  });

  it("should pad to 2 decimal places", () => {
    expect(formatCurrency(100)).toBe("$100.00");
  });
});

describe("formatMillions", () => {
  it("should convert to millions and format", () => {
    expect(formatMillions(125_000_000)).toBe("125");
  });

  it("should handle billions as large millions", () => {
    const result = formatMillions(2_500_000_000);
    expect(result).toBe("2,500");
  });

  it("should round to zero decimals", () => {
    expect(formatMillions(1_500_000)).toBe("2");
  });
});

describe("getUpsideColor", () => {
  it("should return green for upside above threshold (15%)", () => {
    expect(getUpsideColor(20)).toBe("text-green-400");
    expect(getUpsideColor(100)).toBe("text-green-400");
  });

  it("should return red for downside below negative threshold (-15%)", () => {
    expect(getUpsideColor(-20)).toBe("text-red-400");
    expect(getUpsideColor(-50)).toBe("text-red-400");
  });

  it("should return foreground for values within threshold", () => {
    expect(getUpsideColor(0)).toBe("text-foreground");
    expect(getUpsideColor(10)).toBe("text-foreground");
    expect(getUpsideColor(-10)).toBe("text-foreground");
    expect(getUpsideColor(15)).toBe("text-foreground");
    expect(getUpsideColor(-15)).toBe("text-foreground");
  });
});

describe("toDateString", () => {
  it("should format date as YYYY-MM-DD", () => {
    expect(toDateString(new Date("2025-03-15T12:00:00Z"))).toBe("2025-03-15");
  });

  it("should handle start of year", () => {
    expect(toDateString(new Date("2025-01-01T00:00:00Z"))).toBe("2025-01-01");
  });
});
