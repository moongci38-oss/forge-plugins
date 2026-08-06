// sentry-config-colyseus.ts — AD-94 Sentry integration template (Colyseus+NestJS)
// P-7: runtime disable via empty SENTRY_DSN or SENTRY_ENABLED=false
// Wire: import and call initSentry() at top of main.ts BEFORE Server creation
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

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
    profilesSampleRate: 1.0,
    integrations: [nodeProfilingIntegration()],
    enabled: process.env.NODE_ENV !== "test",
  });
}
