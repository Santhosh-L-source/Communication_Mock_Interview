// Creates the first admin account. Usage: npm run create-admin -- admin@college.edu "Admin Name" 'a-strong-password'
import { pool, q } from '../db'
import { supabaseAdmin } from '../supabase'

const [email, name, password] = process.argv.slice(2)
if (!email || !name || !password) {
  console.error('Usage: npm run create-admin -- <email> "<full name>" <password>')
  process.exit(1)
}
const { data, error } = await supabaseAdmin().auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: { full_name: name }, app_metadata: { role: 'admin' },
})
if (error) {
  console.error(error.message)
  process.exit(1)
}
await q(`update profiles set role = 'admin' where id = $1`, [data.user!.id])
console.log(`Admin created: ${email}`)
await pool.end()
