// Starter content: two parallel baseline forms plus a practice and interview bank.
// Trainers should review, extend (target: 100+ items) and approve their own items in the Question bank.

type Dim = 'reading' | 'writing' | 'listening' | 'speaking'
export interface SeedQuestion {
  key: string // stable key so seeding is idempotent
  dimension: Dim
  sub_skill: string
  type: 'mcq' | 'short_text' | 'long_text' | 'listening_mcq' | 'spoken' | 'interview'
  interview_type?: 'hr' | 'self_intro' | 'project' | 'technical' | 'situational' | 'jam'
  difficulty: number
  context?: string
  prompt: string
  passage?: string
  options?: string[]
  answer?: number
  expected_points?: string[]
  time_limit_s?: number
}

const mcqs = (keyPrefix: string, dim: 'reading' | 'listening', context: string, difficulty: number, passage: string,
  items: [string, string, string[], number][]): SeedQuestion[] =>
  items.map(([sub, prompt, options, answer], i) => ({
    key: `${keyPrefix}-${i + 1}`, dimension: dim, sub_skill: sub, type: dim === 'reading' ? 'mcq' : 'listening_mcq',
    difficulty, context, prompt, passage: passage.replace(/\s*\n\s*/g, ' '), options, answer,
  }))

// ---------------- Baseline form A ----------------
const READ_A1 = `Cloud computing lets companies rent computing power instead of buying their own servers. A startup can launch an
application in a day and pay only for what it uses. However, costs can rise quickly if resources are left running when nobody
needs them. For this reason, many companies now employ "FinOps" engineers, whose job is to track cloud spending and switch off
idle resources. Industry surveys suggest that nearly a third of cloud spending is wasted on unused capacity.`
const READ_A2 = `Leave policy (extract): Employees must apply for planned leave at least five working days in advance through the HR
portal. Leave of more than three consecutive days needs approval from both the reporting manager and the project lead. Unplanned
leave due to illness must be reported to the manager before 10 a.m. on the same day; a medical certificate is required if the
absence exceeds two days.`
const LISTEN_A1 = `Good morning, candidates. Your online aptitude test will begin at 10:30, not 10 as mentioned in the email. The test has
three sections: quantitative, logical and verbal, with twenty minutes for each. You cannot return to a section after moving to the
next one. Please keep your camera on throughout, and do not open any other browser tabs. Results will be emailed by Friday evening.`
const LISTEN_A2 = `Hi team, a quick update before the sprint ends. The login feature is complete and tested. The payment module is delayed
by two days because the bank's test server was down on Monday. I have asked Priya to help Arjun with the integration so we can
still demo it on Thursday. Please update your tasks on the board by six today.`

// ---------------- Baseline form B (parallel) ----------------
const READ_B1 = `Many companies now hire through skill-based assessments instead of relying only on degrees. Candidates solve a real
task, such as fixing a bug or writing a short report, and are judged on the result. Supporters say this widens the talent pool
and reduces bias. Critics warn that poorly designed tasks can favour candidates who have more free time to prepare, which may
disadvantage those who work part-time or care for family members.`
const READ_B2 = `Work-from-home guidelines (extract): Employees may work from home up to two days a week with their manager's approval.
They must be reachable on the team chat between 10 a.m. and 5 p.m. Client meetings should be attended from a quiet place with the
camera on. Company laptops must be connected through the VPN at all times when handling client data.`
const LISTEN_B1 = `Hello everyone, welcome to the pre-placement talk. After this session, there will be a group discussion round at
2 p.m. in Seminar Hall B. Groups of eight will be announced on the notice board at 1:30. Each discussion lasts fifteen minutes,
and the panel will look at clarity, listening and teamwork, not just who speaks the most. Shortlisted students will have
technical interviews tomorrow.`
const LISTEN_B2 = `Hi, this is Meera from the client side. We reviewed the dashboard demo yesterday. The charts look good, but the
page takes almost eight seconds to load, which is too slow for our managers. Could your team reduce it to under three seconds
before next Wednesday's review? Also, please add a download button for the monthly report.`

export const QUESTIONS: SeedQuestion[] = [
  // Form A
  ...mcqs('A-R1', 'reading', 'tech_article', 2, READ_A1, [
    ['main_idea', 'What is the main point of the passage?', ['Cloud computing is always cheaper than owning servers', 'Cloud computing is flexible but its costs need to be managed', 'Startups should avoid cloud computing', 'FinOps engineers build cloud servers'], 1],
    ['inference', 'Why would a company hire a FinOps engineer?', ['To design mobile apps', 'To reduce wasted cloud spending', 'To buy more servers', 'To launch applications faster'], 1],
    ['vocabulary', 'In the passage, "idle" resources are resources that are:', ['broken', 'expensive', 'not being used', 'shared by many users'], 2],
  ]),
  ...mcqs('A-R2', 'reading', 'company_policy', 3, READ_A2, [
    ['detail', 'You want four days of planned leave. Whose approval do you need?', ['Only HR', 'Only your reporting manager', 'Your reporting manager and your project lead', 'No approval is needed'], 2],
    ['inference', 'You are ill for three days. What must you provide?', ['Nothing', 'An email to HR only', 'A medical certificate', 'Approval from the project lead'], 2],
  ]),
  { key: 'A-W1', dimension: 'writing', sub_skill: 'professional_email', type: 'long_text', difficulty: 2, context: 'email',
    prompt: 'Your campus interview with a company is scheduled for tomorrow, but you have a university exam at the same time. Write an email (80–120 words) to the HR executive asking to reschedule.',
    expected_points: ['clear subject and greeting', 'reason for the request', 'proposed alternative times', 'polite, professional close'] },
  { key: 'A-W2', dimension: 'writing', sub_skill: 'hr_answer', type: 'short_text', difficulty: 2, context: 'hr',
    prompt: 'In 3–4 sentences, answer in writing: "Why should we hire you for a trainee software engineer role?"',
    expected_points: ['specific strength', 'evidence or example', 'link to the role'] },
  ...mcqs('A-L1', 'listening', 'instructions', 2, LISTEN_A1, [
    ['detail', 'When will the test start?', ['10:00', '10:20', '10:30', '11:00'], 2],
    ['detail', 'Which of these is NOT allowed during the test?', ['Keeping the camera on', 'Opening other browser tabs', 'Finishing a section early', 'Reading the email'], 1],
  ]),
  ...mcqs('A-L2', 'listening', 'team_update', 3, LISTEN_A2, [
    ['main_idea', 'Why is the payment module delayed?', ['Arjun was on leave', 'The bank\'s test server was down', 'The login feature failed testing', 'The demo was cancelled'], 1],
    ['inference', 'What does the speaker want the team to do today?', ['Finish the payment module', 'Update their tasks on the board by six', 'Test the login feature again', 'Call the bank'], 1],
  ]),
  { key: 'A-S1', dimension: 'speaking', sub_skill: 'self_introduction', type: 'spoken', difficulty: 1, context: 'hr', time_limit_s: 90,
    prompt: 'Introduce yourself as you would at the start of a campus interview (about 60–90 seconds).',
    expected_points: ['name, branch, college', 'key skills', 'a project or achievement', 'career goal'] },
  { key: 'A-S2', dimension: 'speaking', sub_skill: 'situation_handling', type: 'spoken', difficulty: 2, context: 'hr', time_limit_s: 120,
    prompt: 'Describe a challenge you faced during a college project and how you handled it.',
    expected_points: ['situation', 'your action', 'result', 'what you learned'] },

  // Form B
  ...mcqs('B-R1', 'reading', 'tech_article', 2, READ_B1, [
    ['main_idea', 'What is the passage mainly about?', ['Why degrees are useless', 'Hiring through skill-based tasks and its pros and cons', 'How to fix bugs quickly', 'Part-time work policies'], 1],
    ['inference', 'According to critics, who might be disadvantaged?', ['People with a lot of free time', 'People who work part-time or care for family', 'Companies with many applicants', 'Candidates with degrees'], 1],
    ['vocabulary', '"Widens the talent pool" means:', ['reduces the number of candidates', 'increases the range of people who can be hired', 'makes salaries higher', 'trains candidates in swimming'], 1],
  ]),
  ...mcqs('B-R2', 'reading', 'company_policy', 3, READ_B2, [
    ['detail', 'How many days a week can employees work from home?', ['One', 'Up to two, with approval', 'Three', 'Any number'], 1],
    ['inference', 'You are working on client data from home. What must you do?', ['Keep the camera on', 'Stay connected through the VPN', 'Attend meetings in the office', 'Get HR approval'], 1],
  ]),
  { key: 'B-W1', dimension: 'writing', sub_skill: 'professional_email', type: 'long_text', difficulty: 2, context: 'email',
    prompt: 'You received an internship offer letter, but your joining date clashes with your final exams. Write an email (80–120 words) to the recruiter requesting a later joining date.',
    expected_points: ['thank them for the offer', 'explain the clash', 'propose a date', 'confirm interest'] },
  { key: 'B-W2', dimension: 'writing', sub_skill: 'summary', type: 'short_text', difficulty: 3, context: 'summary',
    prompt: 'Summarise in 2–3 sentences the main argument for and against skill-based hiring (from the reading passage in this test).',
    passage: READ_B1, expected_points: ['one argument for', 'one argument against', 'own words'] },
  ...mcqs('B-L1', 'listening', 'instructions', 2, LISTEN_B1, [
    ['detail', 'When will the groups be announced?', ['1:00', '1:30', '2:00', 'Tomorrow'], 1],
    ['inference', 'What will the panel look for?', ['Who speaks the most', 'Clarity, listening and teamwork', 'Technical knowledge only', 'English accent'], 1],
  ]),
  ...mcqs('B-L2', 'listening', 'client_call', 3, LISTEN_B2, [
    ['main_idea', 'What is the client\'s main concern?', ['The chart colours', 'The page loads too slowly', 'The report is inaccurate', 'The demo was late'], 1],
    ['detail', 'What else does the client ask for?', ['A mobile app', 'A download button for the monthly report', 'A new login page', 'Daily emails'], 1],
  ]),
  { key: 'B-S1', dimension: 'speaking', sub_skill: 'self_introduction', type: 'spoken', difficulty: 1, context: 'hr', time_limit_s: 90,
    prompt: 'Introduce yourself to an interview panel, focusing on what makes you a good fit for a software role (60–90 seconds).',
    expected_points: ['who you are', 'relevant skills', 'evidence', 'goal'] },
  { key: 'B-S2', dimension: 'speaking', sub_skill: 'project_explanation', type: 'spoken', difficulty: 2, context: 'technical', time_limit_s: 120,
    prompt: 'Explain one of your projects to someone who is not technical: what problem it solves and how it works.',
    expected_points: ['problem', 'solution in simple words', 'your role', 'result'] },

  // Practice bank
  ...mcqs('P-R1', 'reading', 'job_description', 3, `Job description: Associate Data Analyst. You will clean and analyse sales data, build weekly
dashboards and present insights to regional managers. Required: SQL, Excel, and clear written communication. Preferred: Python or
Power BI. Freshers with strong internship projects are encouraged to apply. The role involves occasional travel to regional offices.`, [
    ['detail', 'Which skill is required, not just preferred?', ['Python', 'Power BI', 'SQL', 'Travel planning'], 2],
    ['inference', 'Which candidate best fits this role?', ['A fresher with a strong data internship and SQL skills', 'A senior developer with no SQL', 'A designer who prefers not to travel', 'Someone who only knows Power BI'], 0],
    ['vocabulary', '"Insights" in this context means:', ['complaints', 'useful findings from the data', 'travel plans', 'passwords'], 1],
  ]),
  ...mcqs('P-R2', 'reading', 'email', 2, `Subject: Change in onboarding schedule. Dear new joiners, due to a system upgrade, laptop collection is moved
from Monday to Tuesday at 9 a.m. Monday will now be a virtual orientation from 10 a.m. to 1 p.m. Please carry a government ID on
Tuesday. Reply to this email if you have any accessibility needs.`, [
    ['detail', 'When should new joiners collect their laptops?', ['Monday 9 a.m.', 'Monday 10 a.m.', 'Tuesday 9 a.m.', 'Tuesday 1 p.m.'], 2],
    ['inference', 'Why was the schedule changed?', ['A holiday', 'A system upgrade', 'Too many joiners', 'Accessibility needs'], 1],
  ]),
  { key: 'P-W1', dimension: 'writing', sub_skill: 'professional_email', type: 'long_text', difficulty: 3, context: 'email',
    prompt: 'Write an email to your team lead explaining that you will miss a deadline by one day, why, and what you will do to limit the impact (100–150 words).',
    expected_points: ['early, honest notice', 'reason without excuses', 'recovery plan', 'new date'] },
  { key: 'P-W2', dimension: 'writing', sub_skill: 'cover_letter', type: 'long_text', difficulty: 3, context: 'cover_letter',
    prompt: 'Write the opening paragraph of a cover letter for a graduate engineer trainee role (60–100 words).',
    expected_points: ['role you are applying for', 'one strong qualification', 'why this company'] },
  { key: 'P-W3', dimension: 'writing', sub_skill: 'hr_answer', type: 'short_text', difficulty: 2, context: 'hr',
    prompt: 'In 3–4 sentences, describe your biggest strength with an example.',
    expected_points: ['name the strength', 'specific example', 'result'] },
  { key: 'P-W4', dimension: 'writing', sub_skill: 'grammar', type: 'short_text', difficulty: 1, context: 'grammar',
    prompt: 'Rewrite correctly: "Me and my friend has went to the company for interview yesterday and they told we will inform."',
    expected_points: ['correct subject pronoun', 'past tense', 'complete sentence'] },
  ...mcqs('P-L1', 'listening', 'interviewer_question', 3, `Interviewer: Thanks for coming in. Before we go into technical questions, I'd like
to understand how you work in a team. Can you tell me about a time you disagreed with a teammate, what you did about it, and what
the outcome was? Take a moment if you need to.`, [
    ['main_idea', 'What is the interviewer asking for?', ['Your technical skills', 'A time you disagreed with a teammate and how you handled it', 'Your salary expectations', 'Your favourite subject'], 1],
    ['detail', 'What three things should the answer include?', ['Name, college, branch', 'What happened, what you did, the outcome', 'Strengths, weaknesses, goals', 'Tools, languages, frameworks'], 1],
  ]),
  { key: 'P-S1', dimension: 'speaking', sub_skill: 'fluency', type: 'spoken', difficulty: 2, context: 'jam', time_limit_s: 60,
    prompt: 'Speak for one minute on: "The most important skill for a new engineer".', expected_points: ['clear opinion', 'two reasons', 'example'] },
  { key: 'P-S2', dimension: 'speaking', sub_skill: 'fillers', type: 'spoken', difficulty: 2, context: 'hr', time_limit_s: 60,
    prompt: 'In 45–60 seconds, describe your final-year project. Pause silently instead of saying "um" or "uh".', expected_points: ['what it does', 'your role', 'result'] },
  { key: 'P-S3', dimension: 'speaking', sub_skill: 'situation_handling', type: 'spoken', difficulty: 3, context: 'situational', time_limit_s: 90,
    prompt: 'A client says your team\'s software has a bug just before their launch. What do you say and do?', expected_points: ['acknowledge', 'gather details', 'action plan', 'communicate timeline'] },
  { key: 'P-S4', dimension: 'speaking', sub_skill: 'structure', type: 'spoken', difficulty: 2, context: 'hr', time_limit_s: 90,
    prompt: 'Using the STAR method (Situation, Task, Action, Result), describe a time you learned something quickly.', expected_points: ['situation', 'task', 'action', 'result'] },

  // Interview bank
  ...([
    ['hr', 1, 'Tell me about yourself.'], ['hr', 2, 'What are your greatest strengths, and how have you used them?'],
    ['hr', 2, 'Tell me about a weakness you are working on.'], ['hr', 3, 'Describe a time you handled a conflict in your team.'],
    ['hr', 2, 'Why do you want to work for our company?'], ['hr', 3, 'Tell me about a time you failed and what you learned.'],
    ['hr', 2, 'Where do you see yourself in five years?'], ['hr', 3, 'Why should we hire you over other candidates?'],
    ['self_intro', 1, 'Please introduce yourself.'], ['self_intro', 2, 'What would your friends say about you?'],
    ['self_intro', 2, 'What are you looking for in your first job?'],
    ['project', 2, 'Explain your final year project in simple terms.'], ['project', 2, 'What was your specific role in the project?'],
    ['project', 3, 'What was the hardest technical problem in your project and how did you solve it?'],
    ['project', 3, 'If you had to rebuild your project today, what would you change and why?'],
    ['technical', 2, 'Explain the difference between a process and a thread.'], ['technical', 2, 'What happens when you type a URL into a browser and press Enter?'],
    ['technical', 3, 'Explain what an API is to a non-technical person.'], ['technical', 3, 'How would you find a bug that only happens in production?'],
    ['technical', 3, 'What is the difference between SQL and NoSQL databases, and when would you use each?'],
    ['situational', 2, 'Your teammate misses a deadline that affects your work. What do you do?'],
    ['situational', 3, 'A client asks for a new feature two days before release. How do you respond?'],
    ['situational', 3, 'You disagree with your manager on a technical approach. What do you do?'],
    ['situational', 2, 'You realise you made a mistake in code that is already live. What do you do?'],
    ['situational', 3, 'You are given a task with unclear requirements and your lead is unavailable. How do you proceed?'],
    ['jam', 2, 'Speak for one minute on: Is online learning better than classroom learning?'],
    ['jam', 2, 'Speak for one minute on: Social media does more good than harm.'],
    ['jam', 2, 'Speak for one minute on: The most useful invention of the last 20 years.'],
    ['jam', 3, 'Speak for one minute on: Should AI tools be allowed in exams?'],
  ] as [SeedQuestion['interview_type'], number, string][]).map(([t, d, p], i): SeedQuestion => ({
    key: `I-${i + 1}`, dimension: 'speaking', sub_skill: t === 'technical' ? 'technical_explanation' : t === 'project' ? 'project_explanation' : t === 'jam' ? 'fluency' : 'interview',
    type: 'interview', interview_type: t, difficulty: d, context: t, prompt: p,
  })),
]

export const ASSESSMENTS = [
  { title: 'Baseline assessment (Form A)', duration_min: 40, prefix: 'A-' },
  { title: 'Baseline assessment (Form B, for reattempts)', duration_min: 40, prefix: 'B-' },
]

export const COHORTS = [{ name: 'CSE 2027 Batch', department: 'CSE', batch_year: 2027 }]
