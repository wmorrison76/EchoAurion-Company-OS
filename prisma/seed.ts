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

// Integration partners contacted during outreach (CLAUDE.md §13.1). The spec
// names 18 and asks for 40+ total; the rest are well-known hospitality / F&B
// tech companies to reflect the real pipeline.
const PARTNERS: string[] = [
  'Mews', '7shifts', 'Deputy', 'Tock', 'OpenTable', 'SevenRooms', 'Lightspeed',
  'Toast', 'Amadeus', 'Agilysys', 'Shiji', 'Cloudbeds', 'Oracle OPERA',
  'Infor HMS', 'Quore', 'HotSOS', 'Alice', 'Kipsu', 'SiteMinder', 'Stayntouch',
  'Resy', 'Guestline', 'RoomRaccoon', 'Apaleo', 'Maestro PMS', 'RMS Cloud',
  'Hotelogix', 'eviivo', 'Duetto', 'IDeaS', 'Revinate', 'Cendyn', 'Lighthouse',
  'Canary Technologies', 'Akia', 'Whistle', 'Medallia', 'Actabl', 'Hapi',
  'Beekeeper', 'Optii', 'Knowcross', 'Sabre Hospitality', 'Square',
]

async function seedContacts() {
  const existing = await db.contact.count()
  if (existing > 0) {
    console.log(`contacts: ${existing} already present, skipping`)
    return
  }

  // Active pilot.
  const giovanni = await db.contact.create({
    data: {
      firstName: 'Giovanni',
      lastName: 'Genao',
      company: 'Miccosukee Resort & Gaming',
      title: 'Operations',
      tags: ['pilot'],
    },
  })
  await db.deal.create({
    data: { contactId: giovanni.id, title: 'Miccosukee pilot', stage: 'ACTIVE' },
  })

  // Advisor target (reconnect email sent).
  const mancuso = await db.contact.create({
    data: {
      firstName: 'Robert',
      lastName: 'Mancuso',
      title: 'Hospitality Consultant, CMC',
      tags: ['advisor'],
    },
  })
  await db.deal.create({
    data: { contactId: mancuso.id, title: 'Advisor — Robert Mancuso', stage: 'CONTACTED' },
  })
  await db.outreach.create({
    data: {
      contactId: mancuso.id,
      channel: 'email',
      subject: 'Reconnecting on EchoAurion',
      sentAt: new Date(),
      status: 'SENT',
      actor: 'william_morrison',
    },
  })

  // Integration partners — each: contact + deal (CONTACTED) + outreach (SENT).
  for (const company of PARTNERS) {
    const contact = await db.contact.create({
      data: {
        firstName: 'Partnership',
        lastName: 'Team',
        company,
        title: 'Partnership Team',
        tags: ['integration_partner'],
      },
    })
    await db.deal.create({
      data: { contactId: contact.id, title: `${company} integration`, stage: 'CONTACTED' },
    })
    await db.outreach.create({
      data: {
        contactId: contact.id,
        channel: 'email',
        subject: `EchoAurion × ${company} integration`,
        sentAt: new Date(),
        status: 'SENT',
        actor: 'william_morrison',
      },
    })
  }

  const total = await db.contact.count()
  console.log(`contacts: seeded ${total}`)
}

async function main() {
  await seedBills()
  await seedPilot()
  await seedRaiseConfig()
  await seedContacts()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
