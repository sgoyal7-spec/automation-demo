'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CrmActions() {
  const router = useRouter()
  const [msg, setMsg] = useState('')
  async function run(path: string, label: string) {
    setMsg(`${label}…`)
    const res = await fetch(path, { method: 'POST' })
    const json = await res.json()
    setMsg(`${label}: ${JSON.stringify(json)}`)
    router.refresh()
  }
  return (
    <div className="card row">
      <span className="muted grow">Scheduled jobs run automatically. Trigger them now for the demo:</span>
      <button onClick={() => run('/api/jobs/escalate', 'Escalation check')}>Run escalation check</button>
      <button onClick={() => run('/api/jobs/digest', 'Daily digest')}>Send daily digest</button>
      <button onClick={() => router.refresh()}>Refresh</button>
      {msg && <div className="muted" style={{ width: '100%' }}>{msg}</div>}
    </div>
  )
}
