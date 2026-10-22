import { db } from '@/lib/db'
import { CANNED_REPLIES } from '@/lib/seed-data'
import { Inbox } from './inbox'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const prospects = await db.prospect.findMany({ orderBy: { name: 'asc' }, include: { lead: { select: { status: true } } } })
  return (
    <>
      <h1>Simulated LinkedIn inbox</h1>
      <p className="sub">
        Pick a prospect and "receive" a reply. The system qualifies it with AI, creates the CRM record, assigns a follow-up task, and alerts the account manager in Slack.
      </p>
      <Inbox prospects={prospects.map((p) => ({ ...p, leadStatus: p.lead?.status ?? null }))} cannedReplies={CANNED_REPLIES} />
    </>
  )
}
