'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Prospect { id: string; name: string; title: string; company: string; ownerName: string; leadStatus: string | null }
interface Canned { label: string; text: string }
interface Result { status: string; analysis: { summary: string; suggestedReply: string; nextAction: string; interestLevel: number } }

export function Inbox({ prospects, cannedReplies }: { prospects: Prospect[]; cannedReplies: Canned[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, Result | { error: string }>>({})

  async function send(p: Prospect) {
    const label = selected[p.id] ?? cannedReplies[0].label
    const canned = cannedReplies.find((c) => c.label === label)
    const text = label === 'Custom' ? custom[p.id] ?? '' : canned?.text ?? ''
    if (!text.trim()) return
    setBusy(p.id)
    try {
      const res = await fetch('/api/replies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prospectId: p.id, text }) })
      const json = await res.json()
      setResults((r) => ({ ...r, [p.id]: res.ok ? json : { error: json.error ?? 'failed' } }))
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function reset() {
    await fetch('/api/reset', { method: 'POST' })
    setResults({})
    router.refresh()
  }

  return (
    <>
      {prospects.map((p) => {
        const label = selected[p.id] ?? cannedReplies[0].label
        const r = results[p.id]
        return (
          <div className="card" key={p.id}>
            <div className="row">
              <div className="grow">
                <strong>{p.name}</strong> <span className="muted">· {p.title}, {p.company}</span>
                <div className="muted">Owner: {p.ownerName}{p.leadStatus && <> · CRM status: <span className={`pill ${p.leadStatus}`}>{p.leadStatus}</span></>}</div>
              </div>
              <select value={label} onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.value }))}>
                {cannedReplies.map((c) => <option key={c.label}>{c.label}</option>)}
              </select>
              <button className="primary" disabled={busy === p.id} onClick={() => send(p)}>
                {busy === p.id ? 'Processing…' : 'Receive reply'}
              </button>
            </div>
            {label === 'Custom' ? (
              <textarea placeholder="Type what the prospect replied…" value={custom[p.id] ?? ''} onChange={(e) => setCustom((c) => ({ ...c, [p.id]: e.target.value }))} style={{ marginTop: 10 }} />
            ) : (
              <p className="muted" style={{ margin: '8px 0 0', fontStyle: 'italic' }}>“{cannedReplies.find((c) => c.label === label)?.text}”</p>
            )}
            {r && 'error' in r && <div className="result" style={{ borderColor: 'var(--bad)' }}>Error: {r.error}</div>}
            {r && 'analysis' in r && (
              <div className="result">
                <strong>→ {r.status}</strong> <span className="stars">{'★'.repeat(r.analysis.interestLevel)}{'☆'.repeat(5 - r.analysis.interestLevel)}</span>{'\n'}
                {r.analysis.summary}{'\n\n'}
                <strong>Suggested reply:</strong> {r.analysis.suggestedReply}{'\n\n'}
                <strong>Next action:</strong> {r.analysis.nextAction}{'\n'}
                <span className="muted">Slack alert sent · CRM updated · task created</span>
              </div>
            )}
          </div>
        )
      })}
      <div className="row" style={{ marginTop: 20 }}>
        <span className="muted grow">Reset wipes leads, tasks and history so the walkthrough can be repeated.</span>
        <button className="danger" onClick={reset}>Reset demo data</button>
      </div>
    </>
  )
}
