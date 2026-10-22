export const LEAD_STATUSES = [
  'NEW',
  'INTERESTED',
  'OBJECTION',
  'MEETING_REQUESTED',
  'BOOKED',
  'NOT_NOW',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export type Classification = Exclude<LeadStatus, 'NEW' | 'BOOKED'>

export interface ReplyAnalysis {
  classification: Classification
  interestLevel: number // 1-5
  summary: string
  suggestedReply: string
  nextAction: string
}
