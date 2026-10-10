@echo off
echo ===================================
echo Running Supabase Database Migrations
echo ===================================
echo.

echo Checking if Supabase CLI is installed...
where supabase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Supabase CLI not found!
    echo Please install it first:
    echo   npm install -g supabase
    echo.
    pause
    exit /b 1
)

echo.
echo Supabase CLI found!
echo.
echo Please run these commands manually:
echo.
echo 1. supabase link --project-ref jqdbewyhuozkyhsfgjjz
echo 2. supabase db push
echo.
echo This will apply all 8 migrations to your database.
echo.
pause
