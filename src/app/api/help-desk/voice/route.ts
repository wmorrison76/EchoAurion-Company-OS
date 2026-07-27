import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toDetail } from '@/lib/help-desk'
import type { APIResponse } from '@/types'
import type { HelpTicketDetail, HelpVoiceNoteSource } from '@/types/help-desk'

export const dynamic = 'force-dynamic'

/**
 * Log a voice call via paste / browser dictation (v1 — no Twilio).
 * Creates or attaches a VOICE ticket + HelpVoiceNote + thread message.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ success: false, error: 'Unauthorized', code: '401' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as {
      transcript?: string
      ticketId?: string
      subject?: string
      clientKey?: string
      requesterName?: string
      durationSec?: number
      source?: HelpVoiceNoteSource
    }

    const transcript = body.transcript?.trim()
    if (!transcript) {
      return Response.json({ success: false, error: 'transcript is required' }, { status: 400 })
    }

    const source: HelpVoiceNoteSource = body.source ?? 'PASTE'
    let ticketId = body.ticketId

    if (!ticketId) {
      const subject =
        body.subject?.trim() ||
        `Voice call · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`

      const created = await db.helpTicket.create({
        data: {
          channel: 'VOICE',
          status: 'OPEN',
          subject,
          clientKey: body.clientKey?.trim() || null,
          requesterName: body.requesterName?.trim() || null,
          messages: {
            create: {
              role: 'SYSTEM',
              body: 'Voice call logged (dictation / paste — live Twilio phone not wired yet).',
            },
          },
        },
      })
      ticketId = created.id
      await audit('william_morrison', 'help_desk.ticket.create', ticketId, {
        channel: 'VOICE',
        source,
      })
    } else {
      const existing = await db.helpTicket.findUnique({ where: { id: ticketId } })
      if (!existing) {
        return Response.json({ success: false, error: 'Ticket not found' }, { status: 404 })
      }
    }

    await db.helpVoiceNote.create({
      data: {
        ticketId,
        transcript,
        durationSec: body.durationSec ?? null,
        source,
      },
    })

    await db.helpMessage.create({
      data: {
        ticketId,
        role: 'CUSTOMER',
        body: `[Voice dictation · ${source}]\n\n${transcript}`,
      },
    })

    const updated = await db.helpTicket.update({
      where: { id: ticketId },
      data: {
        channel: 'VOICE',
        status: 'OPEN',
        updatedAt: new Date(),
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        voiceNotes: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    })

    await audit('william_morrison', 'help_desk.voice.create', ticketId, { source })

    return Response.json({
      success: true,
      data: toDetail(updated),
    } satisfies APIResponse<HelpTicketDetail>)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Voice log failed',
      },
      { status: 500 }
    )
  }
}
