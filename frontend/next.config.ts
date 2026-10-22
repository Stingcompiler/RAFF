import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

// Read at build time (`next build`) and dev start: rewrites are baked into the build.
const apiOrigin = process.env.RAFF_API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Same-origin API in development and tests; Caddy routes /api in production.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*/` }];
  },
  skipTrailingSlashRedirect: true,
  // `next dev` must not write files into the (bind-mounted) source tree.
  agentRules: false,
};

export default withNextIntl(nextConfig);
