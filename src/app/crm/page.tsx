import { db } from '@/lib/db'
import { config } from '@/lib/config'
import { CrmActions } from './actions'

export const dynamic = 'force-dynamic'

export default async function CrmPage() {
  const leads = await db.lead.findMany({
    include: { prospect: true, tasks: { orderBy: { dueAt: 'asc' } }, interactions: { orderBy: { createdAt: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  })
  const now = Date.now()
  return (
    <>
      <h1>CRM</h1>
      <p className="sub">Every record here was created by the automation. Follow-up SLA is {config.followUpSlaMinutes} minutes for this demo.</p>
      <CrmActions />
      {leads.length === 0 ? (
        <div className="card muted">No leads yet. Receive a reply from the LinkedIn inbox.</div>
      ) : (
        <table>
          <thead>
            <tr><th>Prospect</th><th>Status</th><th>Interest</th><th>Owner</th><th>Last touch</th><th>Open tasks</th></tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const idleMin = Math.round((now - l.lastTouchAt.getTime()) / 60_000)
              const needsReply = ['INTERESTED', 'MEETING_REQUESTED', 'OBJECTION'].includes(l.status)
              const overdue = needsReply && idleMin >= config.followUpSlaMinutes
              return (
                <tr key={l.id}>
                  <td>
                    <strong>{l.prospect.name}</strong><br /><span className="muted">{l.prospect.title}, {l.prospect.company}</span>
                    <details><summary>History ({l.interactions.length})</summary>
                      <ul className="timeline">
                        {l.interactions.map((i) => <li key={i.id}><span className="ch">{i.channel}</span>{i.text}</li>)}
                      </ul>
                    </details>
                  </td>
                  <td><span className={`pill ${l.status}`}>{l.status}</span><div className="muted" style={{ marginTop: 6 }}>{l.summary}</div></td>
                  <td className="stars">{'★'.repeat(l.interestLevel)}{'☆'.repeat(5 - l.interestLevel)}</td>
                  <td>{l.prospect.ownerName}</td>
                  <td className={overdue ? 'overdue' : ''}>{idleMin} min ago{l.escalatedAt && ' · escalated'}</td>
                  <td>{l.tasks.filter((t) => !t.doneAt).map((t) => <div key={t.id}>• {t.title}</div>)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
