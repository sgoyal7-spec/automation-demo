/**
 * The automation engine. Each exported function is one workflow:
 *   handleProspectReply  -> use cases 1 & 2 (AI qualification + Slack alert + CRM record)
 *   bookMeeting          -> use case 3 (CRM update + prep brief)
 *   markReplied / snooze -> Slack button handlers
 *   escalateOverdue      -> use case 4 (scheduled)
 *   sendDailyDigest      -> use case 5 (scheduled / on demand)
 */
import { db } from './db'
import { analyzeReply } from './ai'
import { config } from './config'
import { digestBlocks, escalationBlocks, postMessage, prepBriefBlocks, replyAlertBlocks, updateMessage } from './slack'

const leadWithProspect = { include: { prospect: true } } as const

export async function handleProspectReply(prospectId: string, replyText: string) {
  const prospect = await db.prospect.findUniqueOrThrow({ where: { id: prospectId } })

  // 1. AI qualification
  const analysis = await analyzeReply(prospect, replyText)

  // 2. Create or update the CRM lead
  const lead = await db.lead.upsert({
    where: { prospectId },
    create: {
      prospectId,
      status: analysis.classification,
      interestLevel: analysis.interestLevel,
      summary: analysis.summary,
      suggestedReply: analysis.suggestedReply,
      nextAction: analysis.nextAction,
      lastTouchAt: new Date(),
    },
    update: {
      status: analysis.classification,
      interestLevel: analysis.interestLevel,
      summary: analysis.summary,
      suggestedReply: analysis.suggestedReply,
      nextAction: analysis.nextAction,
      lastTouchAt: new Date(),
      escalatedAt: null,
    },
    ...leadWithProspect,
  })

  await db.interaction.createMany({
    data: [
      { leadId: lead.id, channel: 'LINKEDIN', direction: 'IN', text: replyText },
      { leadId: lead.id, channel: 'AI', direction: 'OUT', text: `Classified ${analysis.classification} (${analysis.interestLevel}/5). ${analysis.summary}` },
    ],
  })

  // Follow-up task for the owner
  await db.task.create({
    data: {
      leadId: lead.id,
      owner: prospect.ownerName,
      title: analysis.nextAction || `Reply to ${prospect.name}`,
      dueAt: new Date(Date.now() + config.followUpSlaMinutes * 60_000),
    },
  })

  // 3. Slack alert
  const res = await postMessage(replyAlertBlocks(lead, replyText, analysis), `New LinkedIn reply from ${prospect.name} (${analysis.classification})`)
  if (res.ts) {
    await db.lead.update({ where: { id: lead.id }, data: { slackTs: res.ts } })
    await db.interaction.create({ data: { leadId: lead.id, channel: 'SLACK', direction: 'OUT', text: `Alert posted to Slack for ${prospect.ownerName}` } })
  }

  return { lead, analysis }
}

export async function bookMeeting(leadId: string, actor: string) {
  const when = nextBusinessSlot()
  const lead = await db.lead.update({
    where: { id: leadId },
    data: { status: 'BOOKED', lastTouchAt: new Date(), escalatedAt: null },
    ...leadWithProspect,
  })
  await db.task.updateMany({ where: { leadId, doneAt: null }, data: { doneAt: new Date() } })
  await db.task.create({ data: { leadId, owner: lead.prospect.ownerName, title: `Discovery call with ${lead.prospect.name}`, dueAt: when } })
  await db.interaction.create({ data: { leadId, channel: 'SLACK', direction: 'IN', text: `${actor} clicked "Book meeting". Status set to BOOKED.` } })
  await postMessage(prepBriefBlocks(lead, actor, formatWhen(when)), `Meeting booked with ${lead.prospect.name}`, lead.slackTs ?? undefined)
  return lead
}

export async function markReplied(leadId: string, actor: string) {
  const lead = await db.lead.update({ where: { id: leadId }, data: { lastTouchAt: new Date(), escalatedAt: null }, ...leadWithProspect })
  await db.task.updateMany({ where: { leadId, doneAt: null, title: { not: { startsWith: 'Discovery call' } } }, data: { doneAt: new Date() } })
  await db.interaction.create({ data: { leadId, channel: 'SLACK', direction: 'IN', text: `${actor} marked the prospect as replied to.` } })
  return lead
}

export async function snoozeLead(leadId: string, actor: string) {
  const lead = await db.lead.update({ where: { id: leadId }, data: { status: 'NOT_NOW', lastTouchAt: new Date(), escalatedAt: null }, ...leadWithProspect })
  await db.task.updateMany({ where: { leadId, doneAt: null }, data: { doneAt: new Date() } })
  await db.task.create({ data: { leadId, owner: lead.prospect.ownerName, title: `Re-engage ${lead.prospect.name}`, dueAt: new Date(Date.now() + 90 * 86_400_000) } })
  await db.interaction.create({ data: { leadId, channel: 'SLACK', direction: 'IN', text: `${actor} marked as "Not now". Re-engage task created for 90 days.` } })
  return lead
}

/** Scheduled: leads that need a human reply and have gone quiet past the SLA. */
export async function escalateOverdue() {
  const cutoff = new Date(Date.now() - config.followUpSlaMinutes * 60_000)
  const overdue = await db.lead.findMany({
    where: { status: { in: ['INTERESTED', 'MEETING_REQUESTED', 'OBJECTION'] }, lastTouchAt: { lt: cutoff }, escalatedAt: null },
    ...leadWithProspect,
  })
  for (const lead of overdue) {
    const minutes = Math.round((Date.now() - lead.lastTouchAt.getTime()) / 60_000)
    await postMessage(escalationBlocks(lead, minutes), `Follow-up overdue: ${lead.prospect.name}`, lead.slackTs ?? undefined)
    await db.lead.update({ where: { id: lead.id }, data: { escalatedAt: new Date() } })
    await db.interaction.create({ data: { leadId: lead.id, channel: 'SYSTEM', direction: 'OUT', text: `Escalated: no reply for ${minutes} min (SLA ${config.followUpSlaMinutes} min).` } })
  }
  return overdue.length
}

export async function sendDailyDigest() {
  const since = new Date(Date.now() - 24 * 3_600_000)
  const leads = await db.lead.findMany({ where: { updatedAt: { gte: since } }, ...leadWithProspect })
  const replies = await db.interaction.count({ where: { channel: 'LINKEDIN', direction: 'IN', createdAt: { gte: since } } })
  const positive = leads.filter((l) => ['INTERESTED', 'MEETING_REQUESTED', 'BOOKED'].includes(l.status)).length
  const booked = leads.filter((l) => l.status === 'BOOKED').length
  const overdue = leads.filter((l) => l.escalatedAt).length
  const owners = new Map<string, { owner: string; replies: number; booked: number; overdue: number }>()
  for (const l of leads) {
    const o = owners.get(l.prospect.ownerName) ?? { owner: l.prospect.ownerName, replies: 0, booked: 0, overdue: 0 }
    o.replies++
    if (l.status === 'BOOKED') o.booked++
    if (l.escalatedAt) o.overdue++
    owners.set(o.owner, o)
  }
  const summary = { date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), replies, positive, booked, overdue, byOwner: [...owners.values()] }
  await postMessage(digestBlocks(summary), `Daily outreach summary: ${replies} replies, ${booked} booked`)
  return summary
}

/** Refresh the original Slack alert so the buttons disappear and the status is current. */
export async function refreshAlert(leadId: string) {
  const lead = await db.lead.findUnique({ where: { id: leadId }, ...leadWithProspect })
  if (!lead?.slackTs) return
  const reply = await db.interaction.findFirst({ where: { leadId, channel: 'LINKEDIN' }, orderBy: { createdAt: 'desc' } })
  await updateMessage(
    lead.slackTs,
    replyAlertBlocks(lead, reply?.text ?? '', { classification: 'INTERESTED', interestLevel: lead.interestLevel, summary: lead.summary, suggestedReply: lead.suggestedReply, nextAction: lead.nextAction }, false),
    `LinkedIn reply from ${lead.prospect.name} (${lead.status})`,
  )
}

function nextBusinessSlot() {
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() >= 4 ? 8 - d.getDay() : 2))
  d.setHours(14, 0, 0, 0)
  return d
}
const formatWhen = (d: Date) => d.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
