// sentry-config-node.ts — AD-94 Sentry integration template (pure Node.js)
// P-7: runtime disable via empty SENTRY_DSN or SENTRY_ENABLED=false
// Wire: import and call initSentry() at very top of src/index.ts (before other imports)
import * as Sentry from "@sentry/node";

export function initSentry(): void {
  const SENTRY_DSN = process.env.SENTRY_DSN;
  const SENTRY_ENABLED = process.env.SENTRY_ENABLED !== "false";

  if (!SENTRY_DSN || !SENTRY_ENABLED) {
    return; // Sentry disabled
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    enabled: process.env.NODE_ENV !== "test",
  });
}
