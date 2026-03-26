import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react"],
  },
  async redirects() {
    return [
      {
        source: "/:ticker/valuation/peter-lynch",
        destination: "/:ticker/valuation/peg",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/:ticker/summary",
        destination: "/:ticker",
      },
    ];
  },
};

export default nextConfig;
