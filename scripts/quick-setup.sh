#!/bin/bash
set -e

echo "=================================="
echo "🚀 SpeakReady Quick Setup"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Checking database...${NC}"
cd apps/api
if npx tsx --env-file-if-exists=.env -e "
import { pool } from './src/db.js';
(async () => {
  const { rows } = await pool.query('SELECT COUNT(*) FROM profiles LIMIT 1');
  await pool.end();
})().catch(() => process.exit(1));
" 2>&1 | grep -q "error"; then
    echo -e "${RED}✗ Database not ready. Run migrations first!${NC}"
    echo "See SETUP-GUIDE.md"
    exit 1
else
    echo -e "${GREEN}✓ Database connected${NC}"
fi
cd ../..

echo ""
echo -e "${YELLOW}Step 2: Seeding database...${NC}"
npm run seed 2>&1 | tail -10

echo ""
echo -e "${YELLOW}Step 3: Creating admin user...${NC}"
npm run create-admin -- admin@speakready.com "Admin User" "Admin@123" 2>&1 | tail -5

echo ""
echo -e "${GREEN}✓ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. npm run dev:api    (Terminal 1)"
echo "  2. npm run dev:web    (Terminal 2)"
echo "  3. Open http://localhost:5173"
echo "  4. Login with: admin@speakready.com / Admin@123"
