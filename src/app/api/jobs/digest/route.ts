import { NextResponse } from 'next/server'
import { sendDailyDigest } from '@/lib/workflows'

export async function POST() {
  return NextResponse.json(await sendDailyDigest())
}
