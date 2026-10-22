import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Demo helper: wipe leads so the walkthrough can be repeated. Prospects stay. */
export async function POST() {
  await db.task.deleteMany()
  await db.interaction.deleteMany()
  await db.lead.deleteMany()
  return NextResponse.json({ ok: true })
}
