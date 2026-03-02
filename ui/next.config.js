const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1";

const nextConfig = {
  reactStrictMode: true,
  // Standalone for Docker/DO; Vercel handles its own output
  ...(isVercel ? {} : { output: "standalone" }),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Next 14.1+ uses top-level serverExternalPackages
  serverExternalPackages: ["ssh2", "ws"],
  experimental: {
    serverComponentsExternalPackages: ["ssh2", "ws"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("ssh2");
    }
    // Ignore .node binary files
    config.module.rules.push({
      test: /\.node$/,
      use: "node-loader",
    });
    return config;
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
