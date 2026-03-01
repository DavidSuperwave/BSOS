const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverComponentsExternalPackages: ["ssh2", "ws"],
  },
};

// Only wrap with Sentry if DSN is configured
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      // Suppresses source map upload logs during build
      silent: true,
      // Upload source maps for better error traces
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Only upload source maps if auth token is set
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Disable source map upload if no auth token (still works for error capturing)
      disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
      disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
    })
  : nextConfig;
