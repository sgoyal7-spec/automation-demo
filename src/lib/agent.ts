/**
 * The Slack assistant ("@Samantha"). A small tool-using agent: Claude decides which
 * CRM tools to call, we execute them against the database, and Claude writes the answer.
 * Tools are deliberately few and read-mostly; the only write is booking a meeting.
 */
import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message, type Tool } from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'
import { config } from './config'
import { db } from './db'
import { bookMeeting, formatWhen, sendDailyDigest } from './workflows'

const MAX_TOOL_ROUNDS = 6

const TOOLS: Tool[] = [
  {
    toolSpec: {
      name: 'list_leads',
      description: 'List CRM leads (prospects who replied). Optionally filter by status. Returns name, company, status, interest, owner, what they said, and when.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['INTERESTED', 'MEETING_REQUESTED', 'OBJECTION', 'NOT_NOW', 'BOOKED', 'ANY'], description: 'Filter by status. ANY for all.' },
            today_only: { type: 'boolean', description: 'Only leads whose reply arrived in the last 24 hours.' },
          },
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'list_meetings',
      description: 'List booked meetings (discovery calls) with their scheduled time. Use for "how many meetings do I have".',
      inputSchema: { json: { type: 'object', properties: { today_only: { type: 'boolean' } } } },
    },
  },
  {
    toolSpec: {
      name: 'list_overdue',
      description: 'List leads awaiting a human reply past the follow-up SLA.',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
  {
    toolSpec: {
      name: 'book_meeting',
      description: 'Book a discovery call for a lead: sets status BOOKED, creates the task, posts a prep brief to Slack. Only use when the prospect asked to meet or the user explicitly asks to book.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            lead_id: { type: 'string' },
            start_iso: { type: 'string', description: 'Meeting start as ISO 8601 with timezone offset, e.g. 2026-10-23T14:00:00-07:00. Infer from what the prospect said; omit if unknown.' },
          },
          required: ['lead_id'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'send_digest',
      description: 'Post the daily activity summary to the Slack channel.',
      inputSchema: { json: { type: 'object', properties: {} } },
    },
  },
]

type ToolInput = Record<string, unknown>

async function runTool(name: string, input: ToolInput, actor: string): Promise<unknown> {
  const since = new Date(Date.now() - 24 * 3_600_000)
  switch (name) {
    case 'list_leads': {
      const status = typeof input.status === 'string' && input.status !== 'ANY' ? input.status : undefined
      const leads = await db.lead.findMany({
        where: { ...(status ? { status } : {}), ...(input.today_only ? { createdAt: { gte: since } } : {}) },
        include: { prospect: true, interactions: { where: { channel: 'LINKEDIN' }, orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { updatedAt: 'desc' },
      })
      return leads.map((l) => ({
        lead_id: l.id,
        name: l.prospect.name,
        title: l.prospect.title,
        company: l.prospect.company,
        status: l.status,
        interest_1_to_5: l.interestLevel,
        owner: l.prospect.ownerName,
        summary: l.summary,
        prospect_said: l.interactions[0]?.text ?? '',
        replied_at: l.createdAt.toISOString(),
        last_touch_minutes_ago: Math.round((Date.now() - l.lastTouchAt.getTime()) / 60_000),
      }))
    }
    case 'list_meetings': {
      const tasks = await db.task.findMany({
        where: { title: { startsWith: 'Discovery call' }, doneAt: null, ...(input.today_only ? { dueAt: { gte: startOfToday(), lt: new Date(startOfToday().getTime() + 86_400_000) } } : {}) },
        include: { lead: { include: { prospect: true } } },
        orderBy: { dueAt: 'asc' },
      })
      return tasks.map((t) => ({ with: t.lead.prospect.name, company: t.lead.prospect.company, owner: t.owner, at: formatWhen(t.dueAt), at_iso: t.dueAt.toISOString() }))
    }
    case 'list_overdue': {
      const cutoff = new Date(Date.now() - config.followUpSlaMinutes * 60_000)
      const leads = await db.lead.findMany({
        where: { status: { in: ['INTERESTED', 'MEETING_REQUESTED', 'OBJECTION'] }, lastTouchAt: { lt: cutoff } },
        include: { prospect: true },
      })
      return leads.map((l) => ({ lead_id: l.id, name: l.prospect.name, company: l.prospect.company, owner: l.prospect.ownerName, status: l.status, idle_minutes: Math.round((Date.now() - l.lastTouchAt.getTime()) / 60_000) }))
    }
    case 'book_meeting': {
      const leadId = String(input.lead_id ?? '')
      const at = typeof input.start_iso === 'string' ? new Date(input.start_iso) : undefined
      const lead = await bookMeeting(leadId, `${config.assistantName} (asked by ${actor})`, at)
      const task = await db.task.findFirst({ where: { leadId, title: { startsWith: 'Discovery call' } }, orderBy: { createdAt: 'desc' } })
      return { booked: true, with: lead.prospect.name, company: lead.prospect.company, at: task ? formatWhen(task.dueAt) : 'TBD', note: 'Prep brief posted to the channel.' }
    }
    case 'send_digest':
      return await sendDailyDigest()
    default:
      return { error: `unknown tool ${name}` }
  }
}

function systemPrompt() {
  const now = new Date()
  return `You are ${config.assistantName}, a sales operations assistant inside Slack for a LinkedIn outreach team.
Current date/time: ${now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })} (${now.toISOString()}).
Answer questions about leads, replies, meetings and follow-ups using the tools. Always call a tool before stating facts; never invent data.
When asked to book or block the calendar for prospects who agreed to meet: list leads with status MEETING_REQUESTED, infer the date and time from what each prospect said (relative to the current date, in the ${process.env.TZ ?? 'local'} timezone unless they state another), then call book_meeting for each with start_iso. If no time can be inferred, book without start_iso and say the default slot was used.
Reply in Slack mrkdwn (use *bold*, bullet lines starting with "•", no markdown headers or tables). Be concise: a short sentence then bullets. If asked for something outside your tools, say what you can do instead.`
}

/** Run one request through the agent and return the Slack-formatted answer. */
export async function askAssistant(question: string, actor: string): Promise<string> {
  if (config.ai.provider === 'mock') return mockAnswer(question, actor)
  const client = new BedrockRuntimeClient({ region: config.ai.region })
  const messages: Message[] = [{ role: 'user', content: [{ text: question }] }]
  const toolsUsed: string[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await client.send(
      new ConverseCommand({ modelId: config.ai.modelId, system: [{ text: systemPrompt() }], messages, toolConfig: { tools: TOOLS }, inferenceConfig: { maxTokens: 1200 } }),
    )
    const msg = res.output?.message
    if (!msg) break
    messages.push(msg)
    if (res.stopReason !== 'tool_use') {
      const text = msg.content?.map((c) => c.text ?? '').join('').trim()
      return text || `I didn't get a result. Tools used: ${toolsUsed.join(', ') || 'none'}.`
    }
    const results: ContentBlock[] = []
    for (const block of msg.content ?? []) {
      if (!block.toolUse?.toolUseId || !block.toolUse.name) continue
      toolsUsed.push(block.toolUse.name)
      let output: unknown
      try {
        output = await runTool(block.toolUse.name, (block.toolUse.input as ToolInput) ?? {}, actor)
      } catch (err) {
        output = { error: err instanceof Error ? err.message : String(err) }
      }
      results.push({ toolResult: { toolUseId: block.toolUse.toolUseId, content: [{ json: toJson(output) }] } })
    }
    messages.push({ role: 'user', content: results })
  }
  return `I ran out of steps before finishing. Tools used: ${toolsUsed.join(', ')}.`
}

/** Bedrock toolResult json must be an object, not an array. */
const toJson = (v: unknown): DocumentType => JSON.parse(JSON.stringify(Array.isArray(v) ? { items: v, count: v.length } : (v ?? {}))) as DocumentType

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/** Keyword fallback so the assistant still answers when AI_PROVIDER=mock. */
async function mockAnswer(question: string, actor: string): Promise<string> {
  const q = question.toLowerCase()
  if (/overdue|follow.?up/.test(q)) {
    const r = (await runTool('list_overdue', {}, actor)) as { name: string; company: string; idle_minutes: number }[]
    return r.length ? `*${r.length} overdue follow-up(s)*\n` + r.map((x) => `• ${x.name} (${x.company}), ${x.idle_minutes} min idle`).join('\n') : 'No overdue follow-ups.'
  }
  if (/meeting|calendar/.test(q) && /book|block|schedule/.test(q)) {
    const leads = (await runTool('list_leads', { status: 'MEETING_REQUESTED' }, actor)) as { lead_id: string; name: string }[]
    for (const l of leads) await runTool('book_meeting', { lead_id: l.lead_id }, actor)
    return leads.length ? `Booked ${leads.length} meeting(s): ${leads.map((l) => l.name).join(', ')}.` : 'Nobody has asked for a meeting yet.'
  }
  if (/meeting/.test(q)) {
    const r = (await runTool('list_meetings', {}, actor)) as { with: string; at: string }[]
    return r.length ? `*${r.length} meeting(s)*\n` + r.map((x) => `• ${x.with}, ${x.at}`).join('\n') : 'No meetings booked.'
  }
  if (/digest|summary|report/.test(q)) { await runTool('send_digest', {}, actor); return 'Posted the daily digest.' }
  const r = (await runTool('list_leads', { status: 'ANY' }, actor)) as { name: string; company: string; status: string }[]
  return r.length ? `*${r.length} lead(s)*\n` + r.map((x) => `• ${x.name} (${x.company}): ${x.status}`).join('\n') : 'No replies yet.'
}
