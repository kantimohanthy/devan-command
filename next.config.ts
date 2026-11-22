import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // make sure the encrypted vault files ship with the API route on Vercel
  outputFileTracingIncludes: {
    "/api/vault/[name]": ["./src/data/vault/*.json"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
