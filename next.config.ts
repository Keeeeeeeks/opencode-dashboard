import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: process.env.ASSET_PREFIX || undefined,
  env: {
    NEXT_PUBLIC_DASHBOARD_API_KEY: process.env.DASHBOARD_API_KEY || '',
  },
};

export default nextConfig;
