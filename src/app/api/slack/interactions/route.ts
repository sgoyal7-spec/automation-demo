import { NextResponse } from 'next/server'
import { verifySlackSignature } from '@/lib/slack'
import { bookMeeting, markReplied, refreshAlert, snoozeLead } from '@/lib/workflows'

interface SlackInteraction {
  type: string
  user?: { name?: string; username?: string }
  actions?: { action_id: string; value: string }[]
}

/** Slack Interactivity request URL. Slack sends application/x-www-form-urlencoded with a `payload` JSON field. */
export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifySlackSignature(raw, req.headers.get('x-slack-request-timestamp'), req.headers.get('x-slack-signature'))) {
    return new NextResponse('bad signature', { status: 401 })
  }
  const payload = JSON.parse(new URLSearchParams(raw).get('payload') ?? '{}') as SlackInteraction
  if (payload.type !== 'block_actions' || !payload.actions?.length) return new NextResponse('', { status: 200 })

  const actor = payload.user?.username ?? payload.user?.name ?? 'someone'
  const { action_id, value: leadId } = payload.actions[0]

  // Slack requires a 200 within 3 seconds; the work here is small enough to run inline.
  switch (action_id) {
    case 'book_meeting':
      await bookMeeting(leadId, actor)
      break
    case 'mark_replied':
      await markReplied(leadId, actor)
      break
    case 'not_now':
      await snoozeLead(leadId, actor)
      break
    default:
      return new NextResponse('', { status: 200 })
  }
  await refreshAlert(leadId)
  return new NextResponse('', { status: 200 })
}
