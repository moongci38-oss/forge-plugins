#!/usr/bin/env bash
# monitoring-init.sh — Sentry SDK auto-install for forge-onboard Phase 3.5
# P-4: 7 stacks only (Next.js/NestJS/Colyseus/React/Node/Unity/FastAPI)
# P-2: .env.example = SENTRY_DSN+SENTRY_ENVIRONMENT only; .env.ci.example = AUTH_TOKEN+ORG
# P-7: runtime disable via empty SENTRY_DSN or SENTRY_ENABLED=false
#
# Usage:
#   monitoring-init.sh <project-path>
#   monitoring-init.sh --dry-run <project-path>
#   monitoring-init.sh --monitoring-only <project-path>
#   monitoring-init.sh --no-monitoring <project-path>    # skip (Phase 3.5 skip flag)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$(dirname "$SCRIPT_DIR")/templates"

DRY_RUN=false
SKIP_MONITORING=false
MONITORING_ONLY=false
PROJECT_PATH=""

for arg in "$@"; do
  case "$arg" in
    --dry-run)       DRY_RUN=true ;;
    --no-monitoring) SKIP_MONITORING=true ;;
    --monitoring-only) MONITORING_ONLY=true ;;
    -*)              echo "Unknown flag: $arg"; exit 1 ;;
    *)               PROJECT_PATH="$arg" ;;
  esac
done

if [ -z "$PROJECT_PATH" ]; then
  echo "Usage: monitoring-init.sh [--dry-run|--no-monitoring|--monitoring-only] <project-path>"
  exit 1
fi

if [ "$SKIP_MONITORING" = true ]; then
  echo "⏭️  --no-monitoring: Phase 3.5 skipped"
  exit 0
fi

if [ ! -d "$PROJECT_PATH" ]; then
  echo "❌ Project path not found: $PROJECT_PATH"
  exit 1
fi

echo "🔍 Detecting stack at: $PROJECT_PATH"

# ── Stack Detection ────────────────────────────────────────────────────────

STACK=""
PKG_MGR=""

detect_node_pkg_mgr() {
  local dir="$1"
  if [ -f "$dir/pnpm-lock.yaml" ]; then
    PKG_MGR="pnpm"
  elif [ -f "$dir/yarn.lock" ]; then
    PKG_MGR="yarn"
  elif [ -f "$dir/package-lock.json" ]; then
    PKG_MGR="npm"
  else
    PKG_MGR="npm"
  fi
}

if [ -f "$PROJECT_PATH/package.json" ]; then
  PKG_JSON="$PROJECT_PATH/package.json"
  detect_node_pkg_mgr "$PROJECT_PATH"

  if grep -q '"next"' "$PKG_JSON" 2>/dev/null; then
    STACK="nextjs"
  elif grep -q '"@nestjs/core"' "$PKG_JSON" 2>/dev/null; then
    if grep -q '"colyseus"' "$PKG_JSON" 2>/dev/null; then
      STACK="colyseus"   # Colyseus+NestJS → colyseus template
    else
      STACK="nestjs"
    fi
  elif grep -q '"react"' "$PKG_JSON" 2>/dev/null; then
    STACK="react"
  else
    STACK="node"
  fi
elif [ -d "$PROJECT_PATH/Assets" ] && [ -d "$PROJECT_PATH/ProjectSettings" ]; then
  STACK="unity"
elif [ -f "$PROJECT_PATH/pyproject.toml" ] || [ -f "$PROJECT_PATH/requirements.txt" ]; then
  if grep -q 'fastapi' "$PROJECT_PATH/pyproject.toml" 2>/dev/null || \
     grep -q 'fastapi' "$PROJECT_PATH/requirements.txt" 2>/dev/null; then
    STACK="fastapi"
  else
    STACK="python-generic"
  fi
fi

if [ -z "$STACK" ] || [ "$STACK" = "python-generic" ]; then
  echo "⚠️  스택 미지원 또는 감지 실패 (stack=$STACK) — 수동 통합 필요. exit 0."
  exit 0
fi

echo "✅ Stack detected: $STACK (pkg_mgr=${PKG_MGR:-n/a})"

if [ "$DRY_RUN" = true ]; then
  echo "🔸 DRY-RUN mode — no changes applied"
fi

# ── Template Copy ──────────────────────────────────────────────────────────

TEMPLATE_FILE=""
TARGET_FILE=""

case "$STACK" in
  nextjs)   TEMPLATE_FILE="sentry-config-nextjs.ts";   TARGET_FILE="sentry.config.ts" ;;
  nestjs)   TEMPLATE_FILE="sentry-config-nestjs.ts";   TARGET_FILE="src/sentry.config.ts" ;;
  colyseus) TEMPLATE_FILE="sentry-config-colyseus.ts"; TARGET_FILE="src/sentry.config.ts" ;;
  react)    TEMPLATE_FILE="sentry-config-react.ts";    TARGET_FILE="src/sentry.config.ts" ;;
  node)     TEMPLATE_FILE="sentry-config-node.ts";     TARGET_FILE="sentry.config.ts" ;;
  unity)    TEMPLATE_FILE="sentry-config-unity.cs";    TARGET_FILE="Assets/Scripts/SentryInit.cs" ;;
  fastapi)  TEMPLATE_FILE="sentry-config-fastapi.py";  TARGET_FILE="sentry_config.py" ;;
esac

SRC="$TEMPLATES_DIR/$TEMPLATE_FILE"
DST="$PROJECT_PATH/$TARGET_FILE"

if [ ! -f "$SRC" ]; then
  echo "❌ Template not found: $SRC"
  exit 1
fi

if [ "$DRY_RUN" = false ]; then
  mkdir -p "$(dirname "$DST")"
  if [ -f "$DST" ]; then
    echo "⚠️  $TARGET_FILE already exists — skipping template copy (manual review needed)"
  else
    cp "$SRC" "$DST"
    echo "✅ Copied template → $TARGET_FILE"
  fi
else
  echo "🔸 Would copy: $TEMPLATE_FILE → $TARGET_FILE"
fi

# ── SDK Install ────────────────────────────────────────────────────────────

install_sdk() {
  local pkg="$1"
  echo "📦 Installing: $pkg"
  if [ "$DRY_RUN" = true ]; then
    echo "🔸 Would run: $PKG_MGR add $pkg"
    return
  fi
  case "$PKG_MGR" in
    pnpm) pnpm add "$pkg" --prefix "$PROJECT_PATH" ;;
    yarn) yarn --cwd "$PROJECT_PATH" add "$pkg" ;;
    npm)  npm install --prefix "$PROJECT_PATH" "$pkg" ;;
  esac
}

case "$STACK" in
  nextjs)   install_sdk "@sentry/nextjs" ;;
  nestjs)   install_sdk "@sentry/nestjs"; install_sdk "@sentry/profiling-node" ;;
  colyseus) install_sdk "@sentry/node"; install_sdk "@sentry/profiling-node" ;;
  react)    install_sdk "@sentry/react" ;;
  node)     install_sdk "@sentry/node" ;;
  unity)
    MANIFEST="$PROJECT_PATH/Packages/manifest.json"
    if [ -f "$MANIFEST" ]; then
      if grep -q "io.sentry.unity" "$MANIFEST" 2>/dev/null; then
        echo "⚠️  io.sentry.unity already in manifest — skipping"
      else
        if [ "$DRY_RUN" = false ]; then
          python3 -c "
import json, sys
m = json.load(open('$MANIFEST'))
m['dependencies']['io.sentry.unity'] = '2.8.0'
json.dump(m, open('$MANIFEST','w'), indent=2)
print('✅ Added io.sentry.unity to manifest.json')
"
        else
          echo "🔸 Would add io.sentry.unity to Packages/manifest.json"
        fi
      fi
    else
      echo "❌ Packages/manifest.json not found — Unity project structure check needed"
      exit 1
    fi
    ;;
  fastapi)
    echo "📦 Installing: sentry-sdk[fastapi]"
    if [ "$DRY_RUN" = false ]; then
      if [ -f "$PROJECT_PATH/pyproject.toml" ]; then
        echo "⚠️  pyproject.toml detected — add 'sentry-sdk[fastapi]' manually or via 'pip install'"
      fi
      pip install "sentry-sdk[fastapi]" 2>&1 | tail -3
    else
      echo "🔸 Would run: pip install sentry-sdk[fastapi]"
    fi
    ;;
esac

# ── .env.example — DSN + ENVIRONMENT only (P-2) ────────────────────────────

ENV_EXAMPLE="$PROJECT_PATH/.env.example"
ENV_ENTRIES="
# Sentry Monitoring (AD-94)
SENTRY_DSN=https://your-key@sentry.io/your-project
SENTRY_ENVIRONMENT=development
# SENTRY_ENABLED=false  # set to 'false' to disable Sentry at runtime without code change"

if [ "$DRY_RUN" = false ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    if ! grep -q "SENTRY_DSN" "$ENV_EXAMPLE" 2>/dev/null; then
      printf "%s\n" "$ENV_ENTRIES" >> "$ENV_EXAMPLE"
      echo "✅ Appended SENTRY_DSN+SENTRY_ENVIRONMENT to .env.example"
    else
      echo "⚠️  .env.example already has SENTRY_DSN — skipping"
    fi
  else
    printf "%s\n" "# Environment Variables" "$ENV_ENTRIES" > "$ENV_EXAMPLE"
    echo "✅ Created .env.example with SENTRY_DSN+SENTRY_ENVIRONMENT"
  fi
else
  echo "🔸 Would add SENTRY_DSN+SENTRY_ENVIRONMENT to .env.example"
fi

# ── .env.ci.example — AUTH_TOKEN + ORG only (P-2) ─────────────────────────

ENV_CI="$PROJECT_PATH/.env.ci.example"
CI_ENTRIES="# Sentry CI/CD secrets — DO NOT commit to .env or app env (P-2)
# Used for: source map upload, symbol upload, release tracking
# Add as GitHub Actions / CI secrets only
SENTRY_AUTH_TOKEN=your-auth-token-here
SENTRY_ORG=your-org-slug-here
SENTRY_PROJECT=your-project-slug-here"

if [ "$DRY_RUN" = false ]; then
  if [ ! -f "$ENV_CI" ]; then
    printf "%s\n" "$CI_ENTRIES" > "$ENV_CI"
    echo "✅ Created .env.ci.example (AUTH_TOKEN+ORG — CI secret only)"
  else
    echo "⚠️  .env.ci.example already exists — skipping"
  fi
else
  echo "🔸 Would create .env.ci.example with AUTH_TOKEN+ORG"
fi

# ── Update config.json schema ──────────────────────────────────────────────

CONFIG_JSON="$PROJECT_PATH/.forge/config.json"
if [ -f "$CONFIG_JSON" ]; then
  if [ "$DRY_RUN" = false ]; then
    python3 -c "
import json
c = json.load(open('$CONFIG_JSON'))
if 'monitoring' not in c:
    c['monitoring'] = {}
c['monitoring']['sentry'] = {'enabled': True, 'stack': '$STACK'}
json.dump(c, open('$CONFIG_JSON','w'), indent=2)
print('✅ Updated .forge/config.json: monitoring.sentry')
"
  else
    echo "🔸 Would update .forge/config.json: monitoring.sentry.enabled=true, stack=$STACK"
  fi
fi

echo ""
echo "✅ Phase 3.5 monitoring-init complete (stack=$STACK, dry_run=$DRY_RUN)"
echo ""
echo "Next steps:"
echo "  1. Set SENTRY_DSN in .env (production: real DSN, dev: real DSN or empty to disable)"
echo "  2. Add SENTRY_AUTH_TOKEN+SENTRY_ORG to CI secrets only (see .env.ci.example)"
echo "  3. Wire sentry.config into your entry point (see template: $TARGET_FILE)"
if [ "$STACK" = "unity" ]; then
  echo "  4. Unity Editor: Tools → Sentry → Setup (set DSN in SentryOptions.asset)"
  echo "  5. Symbol upload: sentry-cli upload-dif (CI only, see .env.ci.example)"
fi
