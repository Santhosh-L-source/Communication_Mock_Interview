import { one, q } from '../db'

export async function notify(userId: string, title: string, body?: string, link?: string) {
  await q(`insert into notifications (user_id, title, body, link) values ($1,$2,$3,$4)`, [userId, title, body ?? null, link ?? null])
}

// The student's mentor if they have one, otherwise their trainer.
export async function staffFor(studentId: string, prefer: 'mentor' | 'trainer' = 'mentor'): Promise<string | null> {
  const row = await one<{ staff_id: string }>(
    `select sa.staff_id from staff_assignments sa join profiles p on p.id = $1
      where sa.student_id = $1 or sa.cohort_id = p.cohort_id
      order by (sa.relation = $2) desc, (sa.student_id is not null) desc limit 1`, [studentId, prefer])
  return row?.staff_id ?? null
}
