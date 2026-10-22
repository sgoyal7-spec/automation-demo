import { PrismaClient } from '@prisma/client'
import { PROSPECTS } from '../src/lib/seed-data'

const db = new PrismaClient()

async function main() {
  await db.task.deleteMany()
  await db.interaction.deleteMany()
  await db.lead.deleteMany()
  await db.prospect.deleteMany()
  for (const p of PROSPECTS) await db.prospect.create({ data: p })
  console.log(`Seeded ${PROSPECTS.length} prospects`)
}

main().finally(() => db.$disconnect())
