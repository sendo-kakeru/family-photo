import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        hostname: "cdn.photo.sendo-app.com",
        protocol: "https",
      },
    ],
  },
};

export default nextConfig;
