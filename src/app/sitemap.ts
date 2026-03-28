import type { MetadataRoute } from "next";
import { getAllTickers } from "@/lib/db/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://valuscope.com";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/methodology`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // Dynamic stock pages
  let tickers: string[] = [];
  try {
    tickers = await getAllTickers();
  } catch {
    // DB not available — return static pages only
  }

  const stockPages: MetadataRoute.Sitemap = tickers.flatMap((ticker) => [
    {
      url: `${baseUrl}/${ticker}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/${ticker}/valuation/dcf/fcff-ebitda-exit-10y`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/${ticker}/valuation/trading-multiples`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/${ticker}/analyst-estimates`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.6,
    },
  ]);

  return [...staticPages, ...stockPages];
}
