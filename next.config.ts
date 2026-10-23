import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ssh2", "postgres"],
  // Hide Next.js "N" badge — not part of the ops UI chrome
  devIndicators: false,
};

export default nextConfig;
