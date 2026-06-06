import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Known recurring bills (CLAUDE.md §12.3). "varies" days are set to a sensible
// default and can be edited in-app.
const BILLS: Array<{
  name: string
  amount: number
  dueDay: number
  category: string
}> = [
  { name: 'Rent (Apple Wallet transfer)', amount: 1450, dueDay: 1, category: 'rent' },
  { name: 'Netflix', amount: 22, dueDay: 15, category: 'subscription' },
  { name: 'ChatGPT Plus', amount: 20, dueDay: 7, category: 'software' },
  { name: 'GitHub', amount: 4, dueDay: 4, category: 'software' },
  { name: 'Render', amount: 25, dueDay: 1, category: 'software' },
  { name: 'Neon', amount: 19, dueDay: 1, category: 'software' },
  { name: 'Cloudflare', amount: 20, dueDay: 20, category: 'software' },
]

async function seedBills() {
  const existing = await db.bill.count()
  if (existing > 0) {
    console.log(`bills: ${existing} already present, skipping`)
    return
  }
  await db.bill.createMany({ data: BILLS })
  console.log(`bills: seeded ${BILLS.length}`)
}

async function seedPilot() {
  const existing = await db.pilot.count()
  if (existing > 0) {
    console.log(`pilot: already present, skipping`)
    return
  }
  await db.pilot.create({
    data: {
      name: 'Miccosukee',
      stage: 'ACTIVE',
      health: 'GREEN',
      notes: 'Active pilot — Miccosukee Resort & Gaming.',
    },
  })
  console.log('pilot: seeded Miccosukee')
}

async function seedRaiseConfig() {
  const existing = await db.raiseConfig.count()
  if (existing > 0) return
  await db.raiseConfig.create({ data: { target: 500_000, committed: 0, conversations: 0 } })
  console.log('raiseConfig: seeded')
}

async function main() {
  await seedBills()
  await seedPilot()
  await seedRaiseConfig()
  // CRM contacts are seeded in Step 5 (see seed-contacts).
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
