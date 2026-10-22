import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const apiOrigin = process.env.RAFF_API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Same-origin API in development and tests; Caddy routes /api in production.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*/` }];
  },
  skipTrailingSlashRedirect: true,
};

export default withNextIntl(nextConfig);
