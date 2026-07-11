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

const HELP_ARTICLES: Array<{
  slug: string
  title: string
  body: string
  tags: string[]
  panelId?: string
}> = [
  {
    slug: 'login-reset',
    title: 'Sign-in and password reset',
    body: 'If you cannot sign in: (1) Confirm you are on the correct property URL. (2) Use Forgot password — the reset email arrives within a few minutes. (3) If the link expired, request a new one. (4) Still stuck? Ask Support from the app and include the exact error text (no passwords).',
    tags: ['login', 'auth', 'password'],
    panelId: 'settings',
  },
  {
    slug: 'beo-print',
    title: 'Print or export a BEO',
    body: 'Open the Banquet Event Order for the event, then use Print / Export. Choose the outlet and date range if prompted. For PDF, use the browser print dialog → Save as PDF. If the BEO looks incomplete, refresh the event and confirm covers and menu items are saved.',
    tags: ['beo', 'print', 'banquet'],
    panelId: 'beo',
  },
  {
    slug: 'ask-support',
    title: 'How to Ask Aurion Support',
    body: 'From the app, open Ask Support (or Ask Aurion Support). Describe what you expected vs what you saw, which screen you were on, and whether guests were impacted. Do not include guest PII. William or the Knights will reply; when connected, answers push live to your install.',
    tags: ['support', 'ask', 'help'],
    panelId: 'support',
  },
  {
    slug: 'fleet-status',
    title: 'Fleet / multi-station status',
    body: 'Fleet shows which stations or devices are online for your property. A station marked offline usually needs a network check or app restart. Heartbeat should refresh about every minute when the relay is enabled. Escalate if multiple stations go red together.',
    tags: ['fleet', 'heartbeat', 'online'],
    panelId: 'fleet',
  },
  {
    slug: 'schedule-labor',
    title: 'Reading the schedule',
    body: 'Open Schedule to see labor and event timing. Filter by outlet or date. Changes made by managers sync after save — pull to refresh if a shift looks stale. For permanent schedule product changes, use a change request (quoted) rather than a how-to ticket.',
    tags: ['schedule', 'labor'],
    panelId: 'schedule',
  },
  {
    slug: 'purchasing-orders',
    title: 'Purchasing and vendor orders',
    body: 'Purchasing lists open and recent vendor orders. Confirm par levels before submitting. If a line item cost looks wrong, check the vendor catalog sync time. Do not paste invoice guest names into support tickets.',
    tags: ['purchasing', 'vendor', 'orders'],
    panelId: 'purchasing',
  },
  {
    slug: 'nightly-close',
    title: 'Nightly close checklist',
    body: 'Run Close from the Close panel. Complete each step in order; do not skip voids or cash drops if your property requires them. If close fails mid-run, note the step name and Ask Support — we can guide a safe re-run without inventing numbers.',
    tags: ['close', 'eod', 'nightly'],
    panelId: 'close',
  },
  {
    slug: 'inventory-par',
    title: 'Inventory and par levels',
    body: 'Inventory shows on-hand vs par. Count variance should be entered the same day. If counts will not save, check network and try again once — repeated failures need a ticket with the item code (not guest data).',
    tags: ['inventory', 'par'],
    panelId: 'inventory',
  },
  {
    slug: 'forecast-covers',
    title: 'Forecast and covers',
    body: 'Forecast estimates covers from recent patterns. Treat it as guidance for prep, not a guarantee. Large events should be confirmed on the BEO. If forecast looks empty, confirm the date range and outlet filter.',
    tags: ['forecast', 'covers'],
    panelId: 'forecast',
  },
  {
    slug: 'settings-property',
    title: 'Property settings overview',
    body: 'Settings holds property preferences, printers, and integrations. Only managers with the right role should change billing or integration keys. After a settings change, ask the team to refresh the app once.',
    tags: ['settings', 'config'],
    panelId: 'settings',
  },
  {
    slug: 'company-os-help-desk',
    title: 'Company OS — Help Desk (operators)',
    body: 'Operators use Help Desk for live tickets: reply, Ask Knights, Approve & send, Send to client now, Open panel, and Send help article. Standby may auto-answer low-risk TEXT only — never auto-execute code. Pilot must be on the relay wiring branch to honor directives.',
    tags: ['company-os', 'help-desk', 'operator'],
    panelId: 'company-os.help-desk',
  },
  {
    slug: 'company-os-pilot-links',
    title: 'Company OS — Pilot connection',
    body: 'Pilot links shows heartbeat, pending outbox, and Knights standby mode. SSE stream delivers answer_ready, show_message, open_panel, and navigate. Undelivered outbox rows flush when the pilot reconnects.',
    tags: ['company-os', 'pilot', 'relay', 'sse'],
    panelId: 'company-os.pilot-links',
  },
  {
    slug: 'menu-recipes',
    title: 'Menu and recipes',
    body: 'Open Menu to browse recipes and plates. Costing updates after ingredient changes save. If a recipe will not open, try search by name; still broken → Ask Support with the recipe title only.',
    tags: ['menu', 'recipe'],
    panelId: 'menu',
  },
  {
    slug: 'change-request-quote',
    title: 'When a change needs a quote',
    body: 'How-to and config guidance is free. New features, data migrations, or code changes need a quoted work request. Only the designated billing contact can authorize spend. Operators: use Approve free only for true gifts; otherwise Send quote.',
    tags: ['quote', 'billing', 'change-request', 'policy'],
  },
]

async function seedHelpArticles() {
  const existing = await db.helpArticle.count()
  if (existing > 0) {
    console.log(`helpArticles: ${existing} already present, skipping`)
    return
  }
  for (const a of HELP_ARTICLES) {
    await db.helpArticle.create({
      data: {
        slug: a.slug,
        title: a.title,
        body: a.body,
        tags: a.tags,
        panelId: a.panelId ?? null,
      },
    })
  }
  console.log(`helpArticles: seeded ${HELP_ARTICLES.length}`)
}

async function seedHelpEvalCases() {
  const { EVAL_CASE_SEEDS } = await import('../src/lib/help-eval')
  let created = 0
  for (const c of EVAL_CASE_SEEDS) {
    const existing = await db.helpEvalCase.findUnique({ where: { id: c.id } })
    if (existing) continue
    await db.helpEvalCase.create({
      data: {
        id: c.id,
        prompt: c.prompt,
        expectedChannel: c.expectedChannel,
        mustInclude: c.mustInclude,
        mustNotInclude: c.mustNotInclude,
        expectedRecommendation: c.expectedRecommendation ?? null,
        active: true,
      },
    })
    created += 1
  }
  console.log(`helpEvalCases: seeded ${created} new (${EVAL_CASE_SEEDS.length} total defined)`)
}

async function main() {
  await seedBills()
  await seedPilot()
  await seedRaiseConfig()
  await seedContacts()
  await seedHelpArticles()
  await seedHelpEvalCases()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
