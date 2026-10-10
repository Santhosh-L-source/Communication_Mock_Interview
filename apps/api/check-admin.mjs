import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.jqdbewyhuozkyhsfgjjz:Tamil123%40%23!%40%23@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

try {
  const result = await pool.query('SELECT email, full_name, role FROM profiles WHERE role = $1 ORDER BY created_at LIMIT 5', ['admin']);

  if (result.rows.length === 0) {
    console.log('❌ No admin users found in database.');
    console.log('');
    console.log('📝 Create an admin account:');
    console.log('   cd apps/api');
    console.log('   npm run create-admin -- admin@example.com "Admin User" YourPassword123');
  } else {
    console.log('✅ Found admin user(s):');
    console.log('');
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. Email: ${row.email}`);
      console.log(`   Name:  ${row.full_name}`);
      console.log('');
    });
    console.log('ℹ️  Use one of these emails to login.');
    console.log('   If you forgot the password, create a new admin with:');
    console.log('   npm run create-admin -- newemail@example.com "Your Name" NewPassword123');
  }
} catch (error) {
  console.error('❌ Database error:', error.message);
} finally {
  await pool.end();
}
