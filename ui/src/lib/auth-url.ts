const LOCAL_DEV_ORIGIN = "http://localhost:3000";

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return LOCAL_DEV_ORIGIN;

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  return withProtocol.endsWith("/")
    ? withProtocol.slice(0, -1)
    : withProtocol;
}

export function getAuthOrigin(): string {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL;

  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin);
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return LOCAL_DEV_ORIGIN;
}

export function buildAuthCallbackUrl(nextPath = "/"): string {
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  const callbackUrl = new URL("/api/auth/callback", getAuthOrigin());
  callbackUrl.searchParams.set("next", next);
  return callbackUrl.toString();
}
