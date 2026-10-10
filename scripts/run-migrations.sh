#!/bin/bash
echo "==================================="
echo "Running Supabase Database Migrations"
echo "==================================="
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "ERROR: Supabase CLI not found!"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo "Supabase CLI found!"
echo ""
echo "Step 1: Linking to your Supabase project..."
supabase link --project-ref jqdbewyhuozkyhsfgjjz

if [ $? -eq 0 ]; then
    echo ""
    echo "Step 2: Pushing migrations to database..."
    supabase db push
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✓ All migrations applied successfully!"
        echo ""
        echo "Database now has 33 tables including:"
        echo "  - profiles"
        echo "  - interview_sessions"
        echo "  - rubrics"
        echo "  - questions"
        echo "  - And 29 more..."
    else
        echo ""
        echo "✗ Failed to push migrations"
        exit 1
    fi
else
    echo ""
    echo "✗ Failed to link to Supabase project"
    exit 1
fi
