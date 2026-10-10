import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

console.log('🧪 SpeakReady Automated Test Suite\n');
console.log('===================================\n');

// Test 1: Database Connection
console.log('TEST 1: Database Connection');
try {
  const result = await pool.query('SELECT COUNT(*) FROM profiles');
  console.log('✓ Database connected');
  console.log(`✓ Profiles table has ${result.rows[0].count} users\n`);
} catch (e) {
  console.error('✗ Database connection failed:', e.message);
  process.exit(1);
}

// Test 2: Check Seed Data
console.log('TEST 2: Seed Data Verification');
try {
  const rubrics = await pool.query('SELECT COUNT(*) FROM rubrics');
  const questions = await pool.query('SELECT COUNT(*) FROM questions');
  const assessments = await pool.query('SELECT COUNT(*) FROM assessments');
  
  console.log(`✓ Rubrics: ${rubrics.rows[0].count}`);
  console.log(`✓ Questions: ${questions.rows[0].count}`);
  console.log(`✓ Assessments: ${assessments.rows[0].count}\n`);
} catch (e) {
  console.error('✗ Seed data check failed:', e.message);
}

// Test 3: Create Test Student
console.log('TEST 3: Create Test Student');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const testEmail = `test${Date.now()}@speakready.com`;
const testRegNo = `TEST${Date.now().toString().slice(-6)}`;

try {
  const { data, error } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: 'Test@123',
    email_confirm: true,
    user_metadata: {
      full_name: 'Test Student',
      register_no: testRegNo,
      department: 'CSE',
      year_of_study: 3
    }
  });
  
  if (error) throw error;
  
  console.log('✓ Auth user created');
  
  // Wait for trigger
  await new Promise(r => setTimeout(r, 2000));
  
  const profile = await pool.query('SELECT * FROM profiles WHERE email = $1', [testEmail]);
  
  if (profile.rows.length > 0) {
    console.log('✓ Profile created by trigger');
    console.log(`  Email: ${testEmail}`);
    console.log(`  Register No: ${testRegNo}`);
    console.log(`  Role: ${profile.rows[0].role}`);
    
    // Save for later tests
    const fs = await import('fs');
    await fs.promises.writeFile('.test-student.json', JSON.stringify({
      email: testEmail,
      password: 'Test@123',
      registerNo: testRegNo,
      studentId: profile.rows[0].id
    }, null, 2));
    console.log('✓ Test credentials saved\n');
  } else {
    console.log('⚠ Profile not created yet (trigger might be slow)\n');
  }
} catch (e) {
  console.error('✗ Student creation failed:', e.message);
}

// Test 4: API Health Check
console.log('TEST 4: API Server Health');
try {
  const response = await fetch('http://localhost:4001/health');
  const data = await response.json();
  if (data.ok) {
    console.log('✓ API server responding');
    console.log('✓ Health check passed\n');
  }
} catch (e) {
  console.error('✗ API not responding:', e.message, '\n');
}

// Test 5: Check Baseline Assessment
console.log('TEST 5: Baseline Assessment Setup');
try {
  const baseline = await pool.query(
    'SELECT * FROM assessments WHERE is_baseline = true LIMIT 1'
  );
  
  if (baseline.rows.length > 0) {
    console.log('✓ Baseline assessment exists');
    console.log(`  Title: ${baseline.rows[0].title}`);
    console.log(`  Duration: ${baseline.rows[0].duration_min} minutes`);
    
    const items = await pool.query(
      'SELECT COUNT(*) FROM assessment_items WHERE assessment_id = $1',
      [baseline.rows[0].id]
    );
    console.log(`  Questions: ${items.rows[0].count}\n`);
  } else {
    console.log('⚠ No baseline assessment found\n');
  }
} catch (e) {
  console.error('✗ Baseline check failed:', e.message);
}

// Test 6: Check Rubrics
console.log('TEST 6: Rubric Configuration');
try {
  const rubrics = await pool.query('SELECT * FROM rubrics WHERE is_active = true');
  
  for (const rubric of rubrics.rows) {
    const criteria = await pool.query(
      'SELECT COUNT(*) FROM rubric_criteria WHERE rubric_id = $1',
      [rubric.id]
    );
    console.log(`✓ ${rubric.name}: ${criteria.rows[0].count} criteria`);
  }
  console.log();
} catch (e) {
  console.error('✗ Rubric check failed:', e.message);
}

console.log('===================================');
console.log('✅ Core Tests Complete!\n');
console.log('Next: Manual browser testing required for:');
console.log('  - Student login & baseline assessment');
console.log('  - AI interview with proctoring');
console.log('  - Admin panel features\n');

await pool.end();
