// Quick admin creator - Run with: node create-quick-admin.mjs
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const SUPABASE_URL = 'https://jqdbewyhuozkyhsfgjjz.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZGJld3lodW96a3loc2Znamp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA5NDg4MCwiZXhwIjoyMTA2NjcwODgwfQ.ImSh8vdR-k-AjbvEKYmeAiIo9qs0uqbmIcS-EtRVmKo';
const DATABASE_URL = 'postgresql://postgres.jqdbewyhuozkyhsfgjjz:Tamil123%40%23!%40%23@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';

// Get email, name, password from command line or use defaults
const email = process.argv[2] || 'test@admin.com';
const fullName = process.argv[3] || 'Test Admin';
const password = process.argv[4] || 'test123';

console.log('🔧 Creating admin user...');
console.log('   Email:', email);
console.log('   Name:', fullName);
console.log('   Password:', password);
console.log('');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

try {
  // Create user in Supabase Auth
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role: 'admin' }
  });

  if (error) {
    if (error.message.includes('already registered')) {
      console.log('⚠️  User already exists with this email.');
      console.log('');
      console.log('✅ Try logging in with:');
      console.log('   Email:', email);
      console.log('   Password: (use your existing password)');
      console.log('');
      console.log('Or use a different email:');
      console.log('   node create-quick-admin.mjs newemail@test.com "New Admin" newpass123');
      process.exit(0);
    }
    throw error;
  }

  // Update profile to admin role
  const { Pool } = pg;
  const pool = new Pool({ connectionString: DATABASE_URL });

  await pool.query('UPDATE profiles SET role = $1 WHERE id = $2', ['admin', data.user.id]);
  await pool.end();

  console.log('✅ Admin user created successfully!');
  console.log('');
  console.log('🎉 Login credentials:');
  console.log('   URL: http://localhost:5173');
  console.log('   Email:', email);
  console.log('   Password:', password);
  console.log('');
  console.log('📝 Save these credentials!');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('');
  console.log('💡 Try:');
  console.log('   1. Check if API server is running');
  console.log('   2. Verify Supabase connection');
  console.log('   3. Use a different email');
  process.exit(1);
}
