import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow opening the dev server from other devices / your LAN IP (e.g. http://192.168.1.19:3000).
  // Without this, Next.js blocks its dev scripts for non-localhost origins and the page never hydrates.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "127.0.0.1"],
  // pdfkit reads its font metrics from node_modules at runtime, so it must not be bundled.
  serverExternalPackages: ["pdfkit", "exceljs", "pg"],
};

export default nextConfig;
