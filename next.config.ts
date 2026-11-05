import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  allowedDevOrigins: ["app.linkmedin.com", "192.168.0.13"],
  devIndicators: false,
};

export default nextConfig;
