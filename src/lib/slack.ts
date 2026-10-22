import { createHmac, timingSafeEqual } from 'node:crypto'
import { config, slackEnabled } from './config'
import type { ReplyAnalysis } from './types'

type Block = Record<string, unknown>

interface LeadForSlack {
  id: string
  status: string
  interestLevel: number
  prospect: { name: string; title: string; company: string; companySummary: string; linkedinUrl: string; ownerName: string }
}

const STATUS_LABEL: Record<string, string> = {
  INTERESTED: ':large_green_circle: Interested',
  MEETING_REQUESTED: ':calendar: Meeting requested',
  OBJECTION: ':large_orange_circle: Objection',
  NOT_NOW: ':white_circle: Not now',
  BOOKED: ':white_check_mark: Meeting booked',
  NEW: ':new: New',
}

async function slackApi(method: string, body: Record<string, unknown>) {
  if (!slackEnabled()) {
    console.log(`[slack:disabled] ${method}`, JSON.stringify(body).slice(0, 300))
    return { ok: false, ts: undefined as string | undefined }
  }
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${config.slack.botToken}` },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { ok: boolean; error?: string; ts?: string }
  if (!json.ok) console.error(`[slack] ${method} failed:`, json.error)
  return json
}

export const postMessage = (blocks: Block[], text: string, thread_ts?: string) =>
  slackApi('chat.postMessage', { channel: config.slack.channelId, text, blocks, thread_ts })

export const updateMessage = (ts: string, blocks: Block[], text: string) =>
  slackApi('chat.update', { channel: config.slack.channelId, ts, text, blocks })

const stars = (n: number) => ':star:'.repeat(n) + ':black_small_square:'.repeat(Math.max(0, 5 - n))

/** Use case 1 + 2: new reply alert with AI analysis and action buttons. */
export function replyAlertBlocks(lead: LeadForSlack, replyText: string, a: ReplyAnalysis, withActions = true): Block[] {
  const p = lead.prospect
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: `New LinkedIn reply from ${p.name}` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Prospect*\n<${p.linkedinUrl}|${p.name}>, ${p.title}` },
        { type: 'mrkdwn', text: `*Company*\n${p.company}` },
        { type: 'mrkdwn', text: `*Status*\n${STATUS_LABEL[lead.status] ?? lead.status}` },
        { type: 'mrkdwn', text: `*Interest*\n${stars(lead.interestLevel)}` },
        { type: 'mrkdwn', text: `*Owner*\n${p.ownerName}` },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*They said*\n> ${replyText.replace(/\n/g, '\n> ')}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*AI summary*\n${a.summary}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Suggested reply*\n${a.suggestedReply}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `:dart: Next action: ${a.nextAction}  ·  <${config.appUrl}/crm|Open CRM>` }] },
  ]
  if (withActions) {
    blocks.push({
      type: 'actions',
      block_id: `lead_actions:${lead.id}`,
      elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Book meeting' }, action_id: 'book_meeting', value: lead.id },
        { type: 'button', text: { type: 'plain_text', text: 'Mark replied' }, action_id: 'mark_replied', value: lead.id },
        { type: 'button', text: { type: 'plain_text', text: 'Not now' }, action_id: 'not_now', value: lead.id },
      ],
    })
  }
  return blocks
}

/** Use case 3: meeting prep brief posted after Book meeting is clicked. */
export function prepBriefBlocks(lead: LeadForSlack, bookedBy: string, when: string): Block[] {
  const p = lead.prospect
  return [
    { type: 'header', text: { type: 'plain_text', text: `Meeting booked: ${p.company}` } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${p.name}*, ${p.title}\n${when}  ·  booked by ${bookedBy}  ·  owner ${p.ownerName}`,
      },
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*Company background*\n${p.companySummary}` } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          '*Prep checklist*',
          `• Review ${p.name}'s LinkedIn profile and recent posts`,
          `• Pull 2 case studies in a similar industry to ${p.company}`,
          '• Confirm pricing tiers and onboarding timeline',
          '• Send calendar invite with agenda 24h before',
        ].join('\n'),
      },
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `<${config.appUrl}/crm|Open CRM record>` }] },
  ]
}

/** Use case 4: overdue follow-up escalation. */
export function escalationBlocks(lead: LeadForSlack, minutesIdle: number): Block[] {
  const p = lead.prospect
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:rotating_light: *Follow-up overdue* — *${p.name}* (${p.company}) replied *${minutesIdle} min ago* and nobody has responded.\nOwner: *${p.ownerName}*  ·  Status: ${STATUS_LABEL[lead.status] ?? lead.status}`,
      },
    },
    {
      type: 'actions',
      block_id: `escalation:${lead.id}`,
      elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'I replied' }, action_id: 'mark_replied', value: lead.id },
        { type: 'button', text: { type: 'plain_text', text: 'Book meeting' }, action_id: 'book_meeting', value: lead.id },
      ],
    },
  ]
}

/** Use case 5: daily digest. */
export function digestBlocks(d: {
  date: string
  replies: number
  positive: number
  booked: number
  overdue: number
  byOwner: { owner: string; replies: number; booked: number; overdue: number }[]
}): Block[] {
  const ownerLines = d.byOwner.length
    ? d.byOwner.map((o) => `• *${o.owner}*: ${o.replies} replies, ${o.booked} booked, ${o.overdue} overdue`).join('\n')
    : '_No activity yet_'
  return [
    { type: 'header', text: { type: 'plain_text', text: `Daily outreach summary — ${d.date}` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Replies received*\n${d.replies}` },
        { type: 'mrkdwn', text: `*Positive responses*\n${d.positive}` },
        { type: 'mrkdwn', text: `*Meetings booked*\n${d.booked}` },
        { type: 'mrkdwn', text: `*Overdue follow-ups*\n${d.overdue}` },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*By account manager*\n${ownerLines}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `<${config.appUrl}/crm|Open CRM>` }] },
  ]
}

/** Verify Slack request signature (v0 scheme). */
export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  if (!config.slack.signingSecret) return process.env.NODE_ENV !== 'production'
  if (!timestamp || !signature) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false
  const expected = 'v0=' + createHmac('sha256', config.slack.signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}
