#!/usr/bin/env bash
# SpeakReady — test then run.
# Usage: bash scripts/start.sh
# Validates env, checks Supabase, runs API tests, then launches the full stack.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${CYAN}→${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

# Helper: read a key from a .env file (handles simple KEY=VALUE lines)
env_val() {
  local file="$1" key="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]'
}

# ── 1. Prerequisites ─────────────────────────────────────────────────

echo ""
echo -e "${CYAN}═══ SpeakReady ═══${NC}"
echo ""
echo -e "${YELLOW}[1/5] Checking prerequisites...${NC}"

# Node.js >= 20
NODE_V=$(node -v 2>/dev/null | sed 's/^v//' || true)
if [ -z "$NODE_V" ]; then
  fail "Node.js is not installed"
  exit 1
fi
NODE_MAJOR=$(echo "$NODE_V" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js >= 20 required (found v$NODE_V)"
  exit 1
fi
pass "Node.js v$NODE_V"

# npm
NPM_V=$(npm -v 2>/dev/null || true)
if [ -z "$NPM_V" ]; then
  fail "npm is not installed"
  exit 1
fi
pass "npm v$NPM_V"

# .env files
if [ ! -f "$API_DIR/.env" ]; then
  fail "apps/api/.env not found — copy .env.example and fill it in"
  exit 1
fi
pass "apps/api/.env exists"

if [ ! -f "$WEB_DIR/.env" ]; then
  fail "apps/web/.env not found — copy .env.example and fill it in"
  exit 1
fi
pass "apps/web/.env exists"

# node_modules
if [ ! -d "$ROOT/node_modules" ]; then
  warn "node_modules missing — installing dependencies..."
  (cd "$ROOT" && npm install)
fi
pass "Dependencies installed"

# ── 2. Supabase Connectivity ─────────────────────────────────────────

echo ""
echo -e "${YELLOW}[2/5] Checking Supabase connectivity...${NC}"

# --- API-side: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ---
SB_URL=$(env_val "$API_DIR/.env" "SUPABASE_URL")
SB_SERVICE_KEY=$(env_val "$API_DIR/.env" "SUPABASE_SERVICE_ROLE_KEY")
DB_URL=$(env_val "$API_DIR/.env" "DATABASE_URL")

if [ -z "$SB_URL" ] || [ "$SB_URL" = "https://your-project-ref.supabase.co" ]; then
  fail "SUPABASE_URL not configured in apps/api/.env"
  exit 1
fi
pass "SUPABASE_URL is set"

if [ -z "$SB_SERVICE_KEY" ] || echo "$SB_SERVICE_KEY" | grep -q "your-service-role-key"; then
  fail "SUPABASE_SERVICE_ROLE_KEY not configured in apps/api/.env"
  exit 1
fi
pass "SUPABASE_SERVICE_ROLE_KEY is set"

if [ -z "$DB_URL" ] || echo "$DB_URL" | grep -q "your-project-ref"; then
  fail "DATABASE_URL not configured in apps/api/.env"
  exit 1
fi
pass "DATABASE_URL is set"

# Ping Supabase REST API with the service role key
info "Testing Supabase endpoint: $SB_URL"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 10 \
  "${SB_URL}/rest/v1/" \
  -H "apikey: ${SB_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SB_SERVICE_KEY}" \
  2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "000" ]; then
  fail "Cannot reach Supabase at $SB_URL (network error / timeout)"
  exit 1
elif [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  pass "Supabase REST API responded (HTTP $HTTP_CODE) — service role key valid"
elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  fail "Supabase rejected the service role key (HTTP $HTTP_CODE) — check SUPABASE_SERVICE_ROLE_KEY"
  exit 1
else
  warn "Supabase returned HTTP $HTTP_CODE — endpoint reachable but response unexpected"
fi

# Ping Supabase Auth health
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 10 \
  "${SB_URL}/auth/v1/health" \
  -H "apikey: ${SB_SERVICE_KEY}" \
  2>/dev/null || echo "000")

if [ "$AUTH_CODE" = "000" ]; then
  warn "Supabase Auth health check unreachable (non-fatal)"
elif [ "$AUTH_CODE" -ge 200 ] && [ "$AUTH_CODE" -lt 300 ]; then
  pass "Supabase Auth service healthy (HTTP $AUTH_CODE)"
else
  warn "Supabase Auth returned HTTP $AUTH_CODE (non-fatal)"
fi

# --- Web-side: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY ---
VITE_SB_URL=$(env_val "$WEB_DIR/.env" "VITE_SUPABASE_URL")
VITE_ANON_KEY=$(env_val "$WEB_DIR/.env" "VITE_SUPABASE_ANON_KEY")

if [ -z "$VITE_SB_URL" ] || echo "$VITE_SB_URL" | grep -q "your-project"; then
  fail "VITE_SUPABASE_URL not configured in apps/web/.env"
  exit 1
fi
pass "VITE_SUPABASE_URL is set"

if [ -z "$VITE_ANON_KEY" ] || echo "$VITE_ANON_KEY" | grep -q "your-anon"; then
  fail "VITE_SUPABASE_ANON_KEY not configured in apps/web/.env"
  exit 1
fi
pass "VITE_SUPABASE_ANON_KEY is set"

# Ping Supabase with the anon key (what the browser will use)
ANON_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 10 \
  "${VITE_SB_URL}/rest/v1/" \
  -H "apikey: ${VITE_ANON_KEY}" \
  -H "Authorization: Bearer ${VITE_ANON_KEY}" \
  2>/dev/null || echo "000")

if [ "$ANON_CODE" = "000" ]; then
  fail "Cannot reach Supabase at $VITE_SB_URL from web config (network error / timeout)"
  exit 1
elif [ "$ANON_CODE" -ge 200 ] && [ "$ANON_CODE" -lt 300 ]; then
  pass "Supabase anon key valid (HTTP $ANON_CODE) — browser auth will work"
elif [ "$ANON_CODE" = "401" ] || [ "$ANON_CODE" = "403" ]; then
  fail "Supabase rejected the anon key (HTTP $ANON_CODE) — check VITE_SUPABASE_ANON_KEY"
  exit 1
else
  warn "Supabase (anon) returned HTTP $ANON_CODE — reachable but response unexpected"
fi

# --- Database connectivity ---
info "Testing database connection..."
DB_CHECK=$(cd "$API_DIR" && node -e "
  const pg = require('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || '$(echo "$DB_URL")' });
  pool.query('SELECT 1 AS ok')
    .then(() => { console.log('OK'); pool.end(); })
    .catch(e => { console.log('FAIL:' + e.message); pool.end(); process.exit(1); });
" 2>&1 || echo "FAIL:node error")

if echo "$DB_CHECK" | grep -q "^OK"; then
  pass "Database connection successful"
else
  DB_ERR=$(echo "$DB_CHECK" | grep "FAIL:" | sed 's/FAIL://')
  fail "Database connection failed — $DB_ERR"
  exit 1
fi

# ── 3. API Unit Tests ────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}[3/5] Running API unit tests...${NC}"

if (cd "$API_DIR" && npx vitest run --reporter=verbose 2>&1); then
  pass "All API tests passed"
else
  echo ""
  fail "API tests failed — fix the errors above before running the project"
  exit 1
fi

# ── 4. API Health Check ──────────────────────────────────────────────

echo ""
echo -e "${YELLOW}[4/5] API smoke test (health endpoint)...${NC}"

# Read PORT from the api .env (default 4000)
API_PORT=$(env_val "$API_DIR/.env" "PORT")
API_PORT=${API_PORT:-4000}

# Start the API in background for the health check
info "Starting API on port $API_PORT..."
(cd "$API_DIR" && npx tsx src/index.ts) &
API_PID=$!

# Wait for the API to respond (up to 30s)
HEALTH_OK=false
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  sleep 1
done

# Kill the background API process
kill $API_PID 2>/dev/null
wait $API_PID 2>/dev/null || true

if [ "$HEALTH_OK" = true ]; then
  pass "API health check passed (http://localhost:$API_PORT/health)"
else
  fail "API did not respond on port $API_PORT within 30 seconds"
  exit 1
fi

# ── 5. Launch Full Stack ─────────────────────────────────────────────

echo ""
echo -e "${YELLOW}[5/5] Starting full stack...${NC}"
echo ""

info "API  → http://localhost:$API_PORT"
info "Web  → http://localhost:5173"
echo ""
echo -e "${GREEN}All checks passed. Launching SpeakReady...${NC}"
echo -e "${CYAN}Press Ctrl+C to stop.${NC}"
echo ""

cd "$ROOT"
npm run dev
