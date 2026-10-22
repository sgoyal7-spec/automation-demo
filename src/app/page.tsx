import { db } from '@/lib/db'
import { CANNED_REPLIES } from '@/lib/seed-data'
import { Inbox } from './inbox'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const prospects = await db.prospect.findMany({ orderBy: { name: 'asc' }, include: { lead: { select: { status: true } } } })
  return (
    <>
      <h1>Simulated LinkedIn inbox</h1>
      <p className="sub">
        Pick a prospect and "receive" a reply. The system qualifies it with AI, creates the CRM record, assigns a follow-up task, and alerts the account manager in Slack.
      </p>
      <div className="card" style={{ background: '#f0f6ff' }}>
        <strong>Ask {config.assistantName} in Slack.</strong> Mention <code>@{config.assistantName}</code> in the channel with things like
        <em> “who replied today?”</em>, <em>“how many meetings do I have?”</em>, <em>“any overdue follow-ups?”</em>, or
        <em> “check if anyone agreed to meet and block my calendar”</em>. She reads the CRM, books the meetings, and replies in the thread.
      </div>
      <Inbox prospects={prospects.map((p) => ({ ...p, leadStatus: p.lead?.status ?? null }))} cannedReplies={CANNED_REPLIES} />
    </>
  )
}
