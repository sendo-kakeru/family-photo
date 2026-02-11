import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        hostname: "family-photo-storage-proxy.sendokakeru-js.workers.dev",
        protocol: "https",
      },
    ],
  },
};

export default nextConfig;
