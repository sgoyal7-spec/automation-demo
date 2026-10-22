export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { config } = await import('./lib/config')
  const { escalateOverdue } = await import('./lib/workflows')
  const every = Math.max(10, config.schedulerIntervalSeconds) * 1000
  console.log(`[scheduler] escalation check every ${every / 1000}s, SLA ${config.followUpSlaMinutes} min`)
  setInterval(() => {
    escalateOverdue()
      .then((n) => n && console.log(`[scheduler] escalated ${n} lead(s)`))
      .catch((err) => console.error('[scheduler] escalate failed', err))
  }, every).unref()
}
