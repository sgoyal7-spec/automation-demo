import { NextResponse } from 'next/server'
import { handleProspectReply } from '@/lib/workflows'

/** Simulates LinkedIn delivering a prospect's reply. In production this would be a webhook from the inbox provider. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { prospectId?: string; text?: string } | null
  if (!body?.prospectId || !body.text?.trim()) {
    return NextResponse.json({ error: 'prospectId and text are required' }, { status: 400 })
  }
  if (body.text.length > 2000) return NextResponse.json({ error: 'text too long' }, { status: 400 })
  const { lead, analysis } = await handleProspectReply(body.prospectId, body.text.trim())
  return NextResponse.json({ leadId: lead.id, status: lead.status, analysis })
}
