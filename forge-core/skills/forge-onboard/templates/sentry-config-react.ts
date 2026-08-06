// sentry-config-react.ts — AD-94 Sentry integration template (React SPA)
// P-7: runtime disable via empty SENTRY_DSN or SENTRY_ENABLED=false
// Wire: import and call initSentry() at top of src/index.tsx or src/main.tsx
import * as Sentry from "@sentry/react";

export function initSentry(): void {
  const SENTRY_DSN =
    process.env.SENTRY_DSN ??
    (import.meta as unknown as Record<string, Record<string, string>>)?.env
      ?.VITE_SENTRY_DSN ??
    (window as unknown as Record<string, string>).__SENTRY_DSN__;
  const SENTRY_ENABLED = process.env.SENTRY_ENABLED !== "false";

  if (!SENTRY_DSN || !SENTRY_ENABLED) {
    return; // Sentry disabled
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enabled: process.env.NODE_ENV !== "test",
  });
}

// Optional: wrap root with Sentry.ErrorBoundary in App.tsx
// <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>}>
//   <App />
// </Sentry.ErrorBoundary>
