import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // When NEXT_PUBLIC_API_URL is not set (local dev / tunnel mode),
  // proxy /api/* through the Next.js server to the local backend.
  // This means one public tunnel on port 3000 covers everything.
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_URL) return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
