# SpeakReady - test then run.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/start.ps1
# Validates env, checks Supabase, runs API tests, then launches the full stack.

$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$API_DIR = Join-Path $ROOT "apps\api"
$WEB_DIR = Join-Path $ROOT "apps\web"
$API_ENV = Join-Path $API_DIR ".env"
$WEB_ENV = Join-Path $WEB_DIR ".env"

function Write-Pass($msg)  { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Write-Fail($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Info($msg)  { Write-Host "  [INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg)  { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }

function Get-EnvVal($file, $key) {
    $line = Get-Content $file -ErrorAction SilentlyContinue |
        Where-Object { $_ -match "^$key=" } |
        Select-Object -First 1
    if ($line) { return ($line -replace "^$key=", "").Trim() }
    return ""
}

# -- 1. Prerequisites -----------------------------------------------------

Write-Host ""
Write-Host "=== SpeakReady ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "[1/4] Checking prerequisites..." -ForegroundColor Yellow

# Node.js >= 20
try {
    $nodeV = (node -v 2>$null) -replace '^v', ''
    $nodeMajor = [int]($nodeV.Split('.')[0])
    if ($nodeMajor -lt 20) {
        Write-Fail "Node.js >= 20 required (found v$nodeV)"
        exit 1
    }
    Write-Pass "Node.js v$nodeV"
} catch {
    Write-Fail "Node.js is not installed"
    exit 1
}

# npm
try {
    $npmV = npm -v 2>$null
    if (-not $npmV) { throw "missing" }
    Write-Pass "npm v$npmV"
} catch {
    Write-Fail "npm is not installed"
    exit 1
}

# .env files
if (-not (Test-Path $API_ENV)) {
    Write-Fail "apps/api/.env not found - copy .env.example and fill it in"
    exit 1
}
Write-Pass "apps/api/.env exists"

if (-not (Test-Path $WEB_ENV)) {
    Write-Fail "apps/web/.env not found - copy .env.example and fill it in"
    exit 1
}
Write-Pass "apps/web/.env exists"

# node_modules
if (-not (Test-Path (Join-Path $ROOT "node_modules"))) {
    Write-Warn "node_modules missing - installing dependencies..."
    Push-Location $ROOT
    npm install
    Pop-Location
}
Write-Pass "Dependencies installed"

# -- 2. Supabase Connectivity ---------------------------------------------

Write-Host ""
Write-Host "[2/4] Checking Supabase connectivity..." -ForegroundColor Yellow

$SB_URL = Get-EnvVal $API_ENV "SUPABASE_URL"
$SB_SERVICE_KEY = Get-EnvVal $API_ENV "SUPABASE_SERVICE_ROLE_KEY"
$DB_URL = Get-EnvVal $API_ENV "DATABASE_URL"

if (-not $SB_URL -or $SB_URL -match "your-project") {
    Write-Fail "SUPABASE_URL not configured in apps/api/.env"
    exit 1
}
Write-Pass "SUPABASE_URL is set"

if (-not $SB_SERVICE_KEY -or $SB_SERVICE_KEY -match "your-service-role-key") {
    Write-Fail "SUPABASE_SERVICE_ROLE_KEY not configured in apps/api/.env"
    exit 1
}
Write-Pass "SUPABASE_SERVICE_ROLE_KEY is set"

if (-not $DB_URL -or $DB_URL -match "your-project-ref") {
    Write-Fail "DATABASE_URL not configured in apps/api/.env"
    exit 1
}
Write-Pass "DATABASE_URL is set"

# Ping Supabase REST API with the service role key
Write-Info "Testing Supabase endpoint: $SB_URL"
try {
    $resp = Invoke-WebRequest -Uri "$SB_URL/rest/v1/" `
        -Headers @{ "apikey" = $SB_SERVICE_KEY; "Authorization" = "Bearer $SB_SERVICE_KEY" } `
        -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Pass "Supabase REST API responded (HTTP $($resp.StatusCode)) - service role key valid"
} catch {
    $code = $null
    if ($_.Exception.Response) {
        $code = [int]$_.Exception.Response.StatusCode
    }
    if ($code -eq 401 -or $code -eq 403) {
        Write-Fail "Supabase rejected the service role key (HTTP $code) - check SUPABASE_SERVICE_ROLE_KEY"
        exit 1
    } elseif ($code) {
        Write-Warn "Supabase returned HTTP $code - endpoint reachable but response unexpected"
    } else {
        Write-Fail "Cannot reach Supabase at $SB_URL (network error / timeout)"
        exit 1
    }
}

# Ping Supabase Auth health
try {
    $authResp = Invoke-WebRequest -Uri "$SB_URL/auth/v1/health" `
        -Headers @{ "apikey" = $SB_SERVICE_KEY } `
        -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Pass "Supabase Auth service healthy (HTTP $($authResp.StatusCode))"
} catch {
    Write-Warn "Supabase Auth health check returned an error (non-fatal)"
}

# Web-side: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
$VITE_SB_URL = Get-EnvVal $WEB_ENV "VITE_SUPABASE_URL"
$VITE_ANON_KEY = Get-EnvVal $WEB_ENV "VITE_SUPABASE_ANON_KEY"

if (-not $VITE_SB_URL -or $VITE_SB_URL -match "your-project") {
    Write-Fail "VITE_SUPABASE_URL not configured in apps/web/.env"
    exit 1
}
Write-Pass "VITE_SUPABASE_URL is set"

if (-not $VITE_ANON_KEY -or $VITE_ANON_KEY -match "your-anon") {
    Write-Fail "VITE_SUPABASE_ANON_KEY not configured in apps/web/.env"
    exit 1
}
Write-Pass "VITE_SUPABASE_ANON_KEY is set"

# Ping Supabase with the anon key (browser auth)
try {
    $anonResp = Invoke-WebRequest -Uri "$VITE_SB_URL/rest/v1/" `
        -Headers @{ "apikey" = $VITE_ANON_KEY; "Authorization" = "Bearer $VITE_ANON_KEY" } `
        -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Pass "Supabase anon key valid (HTTP $($anonResp.StatusCode)) - browser auth will work"
} catch {
    $code = $null
    if ($_.Exception.Response) {
        $code = [int]$_.Exception.Response.StatusCode
    }
    if ($code -eq 401 -or $code -eq 403) {
        Write-Warn "Supabase rejected the anon key (HTTP $code) - check VITE_SUPABASE_ANON_KEY in apps/web/.env"
        Write-Warn "The app will start but browser auth may fail. Re-copy the anon key from Supabase dashboard > Settings > API"
    } elseif ($code) {
        Write-Warn "Supabase (anon) returned HTTP $code - reachable but response unexpected"
    } else {
        Write-Fail "Cannot reach Supabase at $VITE_SB_URL from web config (network error / timeout)"
        exit 1
    }
}

# Database connectivity
Write-Info "Testing database connection..."
$dbCheckFile = Join-Path $API_DIR "_db_check.cjs"
$dbUrlEscaped = $DB_URL -replace "'", "\'"
@"
const pg = require('pg');
const pool = new pg.Pool({ connectionString: '$dbUrlEscaped' });
pool.query('SELECT 1 AS ok')
  .then(function() { console.log('OK'); pool.end(); })
  .catch(function(e) { console.log('FAIL:' + e.message); pool.end(); process.exit(1); });
"@ | Set-Content -Path $dbCheckFile -Encoding UTF8

Push-Location $API_DIR
$dbResult = node $dbCheckFile 2>&1 | Out-String
Pop-Location
Remove-Item $dbCheckFile -ErrorAction SilentlyContinue

if ($dbResult.Trim() -match "^OK") {
    Write-Pass "Database connection successful"
} else {
    $dbErr = ($dbResult -replace "FAIL:", "").Trim()
    Write-Fail "Database connection failed - $dbErr"
    exit 1
}

# -- 3. API Unit Tests -----------------------------------------------------

Write-Host ""
Write-Host "[3/4] Running API unit tests..." -ForegroundColor Yellow

Push-Location $API_DIR
npx vitest run test/scoring.test.ts --reporter=verbose
$testExit = $LASTEXITCODE
Pop-Location

if ($testExit -ne 0) {
    Write-Host ""
    Write-Fail "API tests failed - fix the errors above before running the project"
    exit 1
}
Write-Pass "All API tests passed"

# -- 4. Launch Full Stack --------------------------------------------------

$API_PORT = Get-EnvVal $API_ENV "PORT"
if (-not $API_PORT) { $API_PORT = "4000" }

Write-Host ""
Write-Host "[4/4] Starting full stack..." -ForegroundColor Yellow
Write-Host ""

Write-Info "API  -> http://localhost:$API_PORT"
Write-Info "Web  -> http://localhost:5173"
Write-Host ""
Write-Host "All checks passed. Launching SpeakReady..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Cyan
Write-Host ""

Push-Location $ROOT
npm run dev
Pop-Location
