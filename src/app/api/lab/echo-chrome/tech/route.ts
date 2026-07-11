import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { draftAnswer } from '@/lib/support-relay'
import { publishRelayEvent, publishAnswerReady } from '@/lib/relay-outbox'
import { toDetail } from '@/lib/help-desk'
import {
  LAB_ECHO_CHROME_CLIENT_KEY,
  LAB_ECHO_CHROME_LABEL,
  LAB_ECHO_CHROME_PROPERTY,
} from '@/lib/lab-echo-chrome'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

const schema = z.object({
  question: z.string().min(1).max(4000),
  profileName: z.string().min(1).max(120),
  profileRole: z.string().min(1).max(40),
  profileEmail: z.string().email().optional(),
  askKnights: z.boolean().optional(),
  send: z.boolean().optional(),
})

/**
 * Lab: Tech support path from Echo chrome mock.
 * Creates TEXT ticket on lab clientKey; optional Knights draft; optional outbox send.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const parsed = schema.safeParse(await req.json())
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid tech-support payload' }, { status: 400 })
    }
    const { question, profileName, profileRole, askKnights, send } = parsed.data

    const client = await db.supportClient.upsert({
      where: { clientKey: LAB_ECHO_CHROME_CLIENT_KEY },
      create: {
        clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
        label: LAB_ECHO_CHROME_LABEL,
        property: LAB_ECHO_CHROME_PROPERTY,
      },
      update: { label: LAB_ECHO_CHROME_LABEL, property: LAB_ECHO_CHROME_PROPERTY },
    })

    const subject = question.trim().slice(0, 120)
    const ticket = await db.helpTicket.create({
      data: {
        channel: 'TEXT',
        status: 'OPEN',
        priority: 'NORMAL',
        subject,
        clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
        clientId: client.id,
        requesterName: `${profileName} (${profileRole})`,
        messages: {
          create: [
            {
              role: 'SYSTEM',
              body: 'Lab Echo chrome · Tech support intake (Company OS harness — not product UI).',
            },
            {
              role: 'CUSTOMER',
              body: question.trim(),
            },
          ],
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'lab.echo_chrome.tech.create', ticket.id, {
      clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
      profileRole,
    })

    let draft: string | null = null
    let draftSeat: string | null = null
    let draftError: string | null = null

    if (askKnights) {
      await db.helpTicket.update({
        where: { id: ticket.id },
        data: { status: 'WITH_KNIGHTS' },
      })
      const result = await draftAnswer(
        `Help Desk ticket: ${subject}\nChannel: TEXT\n\nThread:\n[CUSTOMER] ${question.trim()}`
      )
      if (result.answer) {
        draft = result.answer
        draftSeat = result.seat
        await db.helpMessage.create({
          data: {
            ticketId: ticket.id,
            role: 'KNIGHT',
            body: result.answer,
            seat: result.seat,
          },
        })
        await db.helpTicket.update({
          where: { id: ticket.id },
          data: { status: 'AWAITING_APPROVAL' },
        })
        await audit('william_morrison', 'lab.echo_chrome.tech.knights', ticket.id, {
          seat: result.seat,
        })
      } else {
        draftError = result.error ?? 'Knights draft unavailable'
        await db.helpMessage.create({
          data: {
            ticketId: ticket.id,
            role: 'SYSTEM',
            body: `Knights draft unavailable: ${draftError}`,
          },
        })
      }
    }

    let outboxEventId: string | null = null
    if (send) {
      const reply =
        draft ??
        'Thanks — we received your tech support question. William will follow up from Help Desk.'
      await db.helpMessage.create({
        data: {
          ticketId: ticket.id,
          role: 'ADMIN',
          body: reply,
        },
      })
      const showPayload = {
        type: 'show_message' as const,
        title: 'Tech support reply (lab)',
        body: reply.slice(0, 500),
        severity: 'info' as const,
        ticketId: ticket.id,
      }
      const show = await publishRelayEvent(
        LAB_ECHO_CHROME_CLIENT_KEY,
        'show_message',
        showPayload
      )
      await publishRelayEvent(LAB_ECHO_CHROME_CLIENT_KEY, 'directive', showPayload)
      await publishAnswerReady({
        clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
        questionId: ticket.id,
        question: subject,
        answer: reply,
        directive: showPayload,
      })
      outboxEventId = show.id
      await db.helpMessage.create({
        data: {
          ticketId: ticket.id,
          role: 'SYSTEM',
          body: `Lab outbox simulated · event ${show.id} · SSE pushes when pilot connected.`,
        },
      })
      await audit('william_morrison', 'lab.echo_chrome.tech.send', ticket.id, {
        outboxEventId: show.id,
      })
    }

    const refreshed = await db.helpTicket.findUnique({
      where: { id: ticket.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    return Response.json({
      success: true,
      data: {
        ticket: toDetail(refreshed!),
        draft,
        draftSeat,
        draftError,
        outboxEventId,
        clientKey: LAB_ECHO_CHROME_CLIENT_KEY,
        helpDeskUrl: `/help-desk?ticket=${ticket.id}`,
      },
    } satisfies APIResponse<{
      ticket: HelpTicketDetail
      draft: string | null
      draftSeat: string | null
      draftError: string | null
      outboxEventId: string | null
      clientKey: string
      helpDeskUrl: string
    }>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Lab tech support failed',
      },
      { status: 500 }
    )
  }
}
