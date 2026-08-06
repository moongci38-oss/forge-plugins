// sentry-config-nextjs.ts — AD-94 Sentry integration template (Next.js)
// P-7: runtime disable via empty SENTRY_DSN or SENTRY_ENABLED=false
// Wire: import './sentry-config' in next.config.ts or instrumentation.ts
import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENABLED = process.env.SENTRY_ENABLED !== "false";

if (!SENTRY_DSN || !SENTRY_ENABLED) {
  // Sentry disabled — set SENTRY_DSN to enable
  // Production: use real DSN from Sentry project settings
} else {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    // Performance monitoring — adjust sample rates per environment
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Session replay — production only (privacy)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration()],
    // Disable in test environment
    enabled: process.env.NODE_ENV !== "test",
  });
}

export default Sentry;
