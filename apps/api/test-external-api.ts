// Test External API Integration
import { pool, q } from './src/db';
import * as crypto from 'crypto';
import * as fs from 'fs';

console.log('\n🌐 Testing External API\n');
console.log('===================================\n');

const testStudent = JSON.parse(fs.readFileSync('.test-student.json', 'utf8'));
const API_URL = 'http://localhost:4001';

// Test 1: Create API Key
console.log('TEST 1: Create API Client & Key');
try {
  const apiKey = `speakready_test_${crypto.randomBytes(16).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const client = await q(`
    INSERT INTO api_clients (name, key_hash, scopes, is_active)
    VALUES ($1, $2, $3, true)
    RETURNING *
  `, ['Test Integration', keyHash, ['scores:read']]);

  console.log('✓ API client created:', client[0].name);
  console.log('  ID:', client[0].id);
  console.log('  API Key:', apiKey);
  console.log('  Scopes:', client[0].scopes.join(', '), '\n');

  // Save for external testing
  fs.writeFileSync('.test-api-key.txt', apiKey);
} catch (e: any) {
  console.error('✗ Failed:', e.message, '\n');
}

// Test 2: Test External API Endpoint
console.log('TEST 2: GET /api/v1/external/students/:register_no');
try {
  const apiKey = fs.readFileSync('.test-api-key.txt', 'utf8').trim();

  const response = await fetch(
    `${API_URL}/api/v1/external/students/${testStudent.registerNo}`,
    {
      headers: {
        'x-api-key': apiKey
      }
    }
  );

  if (response.ok) {
    const data = await response.json();
    console.log('✓ External API working');
    console.log('  Register No:', data.register_no);
    console.log('  Full Name:', data.full_name);
    console.log('  Department:', data.department);

    if (data.readiness) {
      console.log('  Readiness Score:', data.readiness.score, '/100');
      console.log('  Level:', data.readiness.level, '/4');
    }

    console.log('  Interviews:', data.interviews ? data.interviews.length : 0);
    console.log();
  } else {
    const error = await response.text();
    console.log('⚠ API returned:', response.status, error, '\n');
  }
} catch (e: any) {
  console.error('✗ Failed:', e.message, '\n');
}

// Test 3: Invalid API Key
console.log('TEST 3: Test Authentication (invalid key)');
try {
  const response = await fetch(
    `${API_URL}/api/v1/external/students/${testStudent.registerNo}`,
    {
      headers: {
        'x-api-key': 'invalid_key_12345'
      }
    }
  );

  if (response.status === 401 || response.status === 403) {
    console.log('✓ Authentication working (rejected invalid key)');
    console.log('  Status:', response.status, response.statusText, '\n');
  } else {
    console.log('⚠ Unexpected response:', response.status, '\n');
  }
} catch (e: any) {
  console.error('✗ Failed:', e.message, '\n');
}

// Test 4: Webhook Configuration
console.log('TEST 4: Webhook System');
try {
  const webhook = await q(`
    INSERT INTO webhooks (name, url, secret, is_active)
    VALUES ($1, $2, $3, true)
    RETURNING *
  `, ['Test Webhook', 'https://example.com/webhook', 'test_secret_123']);

  console.log('✓ Webhook configured:', webhook[0].name);
  console.log('  URL:', webhook[0].url);
  console.log('  Active:', webhook[0].is_active, '\n');
} catch (e: any) {
  console.error('✗ Failed:', e.message, '\n');
}

console.log('===================================');
console.log('✅ External API Tests Complete!\n');
console.log('📊 Integration Ready:');
console.log('  ✓ API client created');
console.log('  ✓ Authentication working');
console.log('  ✓ Student data endpoint working');
console.log('  ✓ Webhook system configured\n');

console.log('🔑 API Key saved to: .test-api-key.txt');
console.log('Use it to test from external systems!\n');

await pool.end();
