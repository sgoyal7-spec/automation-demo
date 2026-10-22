import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { config } from './config'
import type { Classification, ReplyAnalysis } from './types'

const SYSTEM_PROMPT = `You are a sales assistant for an outbound lead-generation agency.
An account manager sent a LinkedIn outreach message to a prospect and the prospect replied.
Classify the reply and draft a short, warm, non-pushy response the account manager could send.

Return ONLY a JSON object with these keys:
- classification: one of INTERESTED, MEETING_REQUESTED, OBJECTION, NOT_NOW
- interestLevel: integer 1 (cold) to 5 (hot)
- summary: one sentence describing what the prospect said and wants
- suggestedReply: 2-4 sentences, first person, ready to paste into LinkedIn
- nextAction: one short imperative sentence for the account manager`

interface ProspectContext {
  name: string
  title: string
  company: string
  companySummary: string
}

export async function analyzeReply(prospect: ProspectContext, replyText: string): Promise<ReplyAnalysis> {
  if (config.ai.provider === 'mock') return mockAnalyze(prospect, replyText)
  try {
    return await bedrockAnalyze(prospect, replyText)
  } catch (err) {
    console.error('[ai] Bedrock call failed, falling back to rules:', err)
    return mockAnalyze(prospect, replyText)
  }
}

async function bedrockAnalyze(prospect: ProspectContext, replyText: string): Promise<ReplyAnalysis> {
  const client = new BedrockRuntimeClient({ region: config.ai.region })
  const userMessage = `Prospect: ${prospect.name}, ${prospect.title} at ${prospect.company}
Company notes: ${prospect.companySummary}

Prospect's LinkedIn reply:
"""
${replyText}
"""`

  const res = await client.send(
    new ConverseCommand({
      modelId: config.ai.modelId,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [{ role: 'user', content: [{ text: userMessage }] }],
      inferenceConfig: { maxTokens: 500 },
    }),
  )
  const text = res.output?.message?.content?.map((c) => c.text ?? '').join('') ?? ''
  return parseAnalysis(text)
}

function parseAnalysis(text: string): ReplyAnalysis {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error(`No JSON in model output: ${text.slice(0, 200)}`)
  const raw = JSON.parse(text.slice(start, end + 1)) as Partial<ReplyAnalysis>
  const allowed: Classification[] = ['INTERESTED', 'MEETING_REQUESTED', 'OBJECTION', 'NOT_NOW']
  const classification = allowed.includes(raw.classification as Classification)
    ? (raw.classification as Classification)
    : 'INTERESTED'
  return {
    classification,
    interestLevel: Math.min(5, Math.max(1, Math.round(Number(raw.interestLevel) || 3))),
    summary: String(raw.summary ?? '').trim(),
    suggestedReply: String(raw.suggestedReply ?? '').trim(),
    nextAction: String(raw.nextAction ?? '').trim(),
  }
}

/** Keyword rules. Used when AI_PROVIDER=mock or as a safety net if Bedrock is unreachable mid-demo. */
export function mockAnalyze(prospect: ProspectContext, replyText: string): ReplyAnalysis {
  const t = replyText.toLowerCase()
  const first = prospect.name.split(' ')[0]
  if (/(let'?s talk|free (on )?\w+day|send me (a few )?times|book|calendar|schedule)/.test(t)) {
    return {
      classification: 'MEETING_REQUESTED',
      interestLevel: 5,
      summary: `${prospect.name} wants to schedule a call this week.`,
      suggestedReply: `Great, ${first}. I have Thursday at 2pm or Friday at 1pm Pacific open. Which works better? I'll send a calendar invite as soon as you confirm.`,
      nextAction: 'Send two time options and a calendar hold today.',
    }
  }
  if (/(cost|price|expensive|budget|didn'?t justify|not sure this is different)/.test(t)) {
    return {
      classification: 'OBJECTION',
      interestLevel: 2,
      summary: `${prospect.name} had a poor ROI experience with a previous agency and is skeptical about cost.`,
      suggestedReply: `Totally fair, ${first}. Most of the teams we work with came to us after a similar experience. Would it help if I shared the actual reply and meeting numbers from a client in a similar space, so you can judge the math yourself?`,
      nextAction: 'Reply with a relevant case study and ROI numbers; do not pitch a call yet.',
    }
  }
  if (/(not now|heads.?down|circle back|later|next quarter|q1|spring)/.test(t)) {
    return {
      classification: 'NOT_NOW',
      interestLevel: 2,
      summary: `${prospect.name} is busy and asked to be contacted later.`,
      suggestedReply: `Understood, ${first}. Good luck with the launch. I'll check back in a few months. If anything changes before then, feel free to reach out.`,
      nextAction: 'Set a follow-up reminder for 90 days out.',
    }
  }
  return {
    classification: 'INTERESTED',
    interestLevel: 4,
    summary: `${prospect.name} is interested and asked for more information about the program.`,
    suggestedReply: `Thanks, ${first}. Happy to share. In short, we build the target list, run the LinkedIn outreach, and hand you qualified replies. I'll send a one-page overview with recent results. Would a quick 20-minute call next week be useful to see if it fits ${prospect.company}?`,
    nextAction: 'Send the overview deck and propose a 20-minute discovery call.',
  }
}
