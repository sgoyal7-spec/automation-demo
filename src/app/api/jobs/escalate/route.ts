import { NextResponse } from 'next/server'
import { escalateOverdue } from '@/lib/workflows'

export async function POST() {
  const escalated = await escalateOverdue()
  return NextResponse.json({ escalated })
}
