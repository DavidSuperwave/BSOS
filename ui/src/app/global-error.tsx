"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", color: "#fff", background: "#0a0a0a" }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#888" }}>An unexpected error occurred. The error has been reported.</p>
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              background: "#1a1a1a",
              color: "#fff",
              border: "1px solid #333",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
