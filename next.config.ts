import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.BASE_PATH || undefined,
  assetPrefix: process.env.ASSET_PREFIX || undefined,
  env: {
    NEXT_PUBLIC_DASHBOARD_API_KEY: process.env.DASHBOARD_API_KEY || '',
    NEXT_PUBLIC_API_BASE: process.env.BASE_PATH || '',
  },
};

export default nextConfig;
