import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // `output: "standalone"` produces `.next/standalone/` with only the files
  // the server actually imports plus a trimmed `node_modules`. The Docker
  // runtime stage in `Dockerfile` copies that tree instead of the full
  // workspace — ~150 MB image instead of ~1.2 GB. Required for the
  // self-hosted staging deploy (see docs/INFRA.md).
  //
  // Vercel deploys ignore this and use their own bundler.
  output: "standalone",
};

export default withNextIntl(nextConfig);
