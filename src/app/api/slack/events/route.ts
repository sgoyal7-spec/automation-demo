import { NextResponse, after } from 'next/server'
import { config } from '@/lib/config'
import { postMessage, verifySlackSignature } from '@/lib/slack'
import { askAssistant } from '@/lib/agent'

interface SlackEventEnvelope {
  type: string
  challenge?: string
  event_id?: string
  event?: { type: string; text?: string; user?: string; channel?: string; ts: string; thread_ts?: string; bot_id?: string }
}

// Slack retries events it did not see acknowledged within 3s. Remember recent ids to avoid double replies.
const seen = new Map<string, number>()
function isDuplicate(id: string) {
  const now = Date.now()
  for (const [k, t] of seen) if (now - t > 10 * 60_000) seen.delete(k)
  if (seen.has(id)) return true
  seen.set(id, now)
  return false
}

/** Slack Events API endpoint. Subscribed bot event: app_mention. */
export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifySlackSignature(raw, req.headers.get('x-slack-request-timestamp'), req.headers.get('x-slack-signature'))) {
    return new NextResponse('bad signature', { status: 401 })
  }
  const body = JSON.parse(raw) as SlackEventEnvelope

  // One-time handshake when the Request URL is saved in the Slack app settings.
  if (body.type === 'url_verification') return NextResponse.json({ challenge: body.challenge })

  const ev = body.event
  if (body.type !== 'event_callback' || ev?.type !== 'app_mention' || ev.bot_id) return new NextResponse('', { status: 200 })
  if (body.event_id && isDuplicate(body.event_id)) return new NextResponse('', { status: 200 })

  const question = (ev.text ?? '').replace(/<@[A-Z0-9]+>/g, '').trim()
  const threadTs = ev.thread_ts ?? ev.ts
  const actor = ev.user ? `<@${ev.user}>` : 'someone'

  // Acknowledge now; think and reply after the response is sent (Slack's 3-second rule).
  after(async () => {
    try {
      const answer = question ? await askAssistant(question, actor) : `Hi, I'm ${config.assistantName}. Ask me things like "who replied today?", "how many meetings do I have?", "any overdue follow-ups?", or "book meetings with everyone who agreed".`
      await postMessage([{ type: 'section', text: { type: 'mrkdwn', text: answer } }], answer, threadTs)
    } catch (err) {
      console.error('[assistant] failed', err)
      await postMessage([{ type: 'section', text: { type: 'mrkdwn', text: `Sorry, I hit an error answering that.` } }], 'error', threadTs)
    }
  })
  return new NextResponse('', { status: 200 })
}
