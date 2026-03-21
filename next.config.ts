import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
