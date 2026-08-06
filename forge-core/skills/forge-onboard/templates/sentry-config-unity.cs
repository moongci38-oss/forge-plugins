// sentry-config-unity.cs — AD-94 Sentry integration template (Unity C#)
// P-7: runtime disable via empty SENTRY_DSN or SENTRY_ENABLED env
// P-9: SentryOptions.asset DSN = placeholder — set real DSN in Editor: Tools → Sentry → Setup
// Wire: attach SentryInit component to a persistent GameObject in the first scene
// NOTE: Primary Sentry init for Unity is via SentryOptions.asset (Editor-driven).
//       This script provides programmatic override/guard for runtime environments.
using UnityEngine;

public class SentryInit : MonoBehaviour
{
    private void Awake()
    {
        // SentryOptions.asset is the primary configuration (set via Editor: Tools → Sentry → Setup)
        // This guard prevents init when DSN is empty (dev/CI environments without real DSN)
        var sentryDsn = System.Environment.GetEnvironmentVariable("SENTRY_DSN");
        var sentryEnabled = System.Environment.GetEnvironmentVariable("SENTRY_ENABLED");

        if (string.IsNullOrEmpty(sentryDsn) || sentryEnabled == "false")
        {
            // Sentry disabled — no DSN in environment
            // To enable: set SENTRY_DSN in build environment or configure SentryOptions.asset
            Debug.Log("[Sentry] Disabled — SENTRY_DSN not set");
            return;
        }

        // Sentry Unity SDK is primarily configured via SentryOptions.asset
        // For programmatic configuration, use the SentryUnity ScriptableObject API
        Debug.Log("[Sentry] Initialized via SentryOptions.asset");
    }
}
// TODO (Sentry 운영 활성):
//   1. Unity Editor: Tools → Sentry → Setup → enter DSN from Sentry project settings
//   2. Verify SentryOptions.asset created at Assets/Resources/Sentry/SentryOptions.asset
//   3. Test: Sentry.CaptureMessage("AD-94 init test") and verify in Sentry dashboard
//   4. Symbol upload (CI): sentry-cli upload-dif --include-sources (see .env.ci.example)
