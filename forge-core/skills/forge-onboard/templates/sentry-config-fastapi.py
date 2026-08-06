# sentry-config-fastapi.py — AD-94 Sentry integration template (FastAPI)
# P-7: runtime disable via empty SENTRY_DSN or SENTRY_ENABLED=false
# Wire: import and call init_sentry() at top of main.py BEFORE app creation
import os
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration


def init_sentry() -> None:
    dsn = os.getenv("SENTRY_DSN")
    enabled = os.getenv("SENTRY_ENABLED", "true").lower() != "false"

    if not dsn or not enabled:
        return  # Sentry disabled — set SENTRY_DSN to enable

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "development"),
        traces_sample_rate=0.1 if os.getenv("APP_ENV") == "production" else 1.0,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        # Disable in test environment
        enabled=os.getenv("TESTING") != "true",
    )
