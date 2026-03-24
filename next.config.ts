import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react"],
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
