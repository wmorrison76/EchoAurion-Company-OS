/**
 * Support voice TTS framework — separate from guest / Chef Echo voices.
 * Feature-flagged; no-op when unset. See docs/SUPPORT_VOICE.md.
 */

export type SupportVoiceProvider = 'elevenlabs' | 'none'

export interface SupportVoiceConfig {
  provider: SupportVoiceProvider
  voiceId: string | null
  enabled: boolean
  /** Never guest-facing by default. */
  guestFacing: false
}

export interface SynthesizeInput {
  text: string
  /** Optional override; defaults to SUPPORT_VOICE_ID. */
  voiceId?: string
}

export interface SynthesizeResult {
  ok: boolean
  /** audio/mpeg bytes when provider succeeds; null on no-op/dev. */
  audio: Buffer | null
  contentType: string | null
  skipped: boolean
  reason?: string
}

/** Text tone guide for Knights drafts (existing). */
export const SUPPORT_VOICE_GUIDE = `
Voice (hospitality operator — human, not robotic):
- Write like a calm, capable colleague on the property floor: warm, clear, respectful of the guest and the team.
- Short paragraphs. Plain language matching the customer. No jargon dumps, no bullet walls unless a short checklist truly helps.
- Empathy first when something is broken or stressful — acknowledge the impact, then move to what to do next.
- Give concrete next steps the operator can take today (which screen, which setting, who to ask).
- Never invent product capabilities, screens, or integrations. If you are unsure, say so and suggest how to verify.
- Never reveal internal system names, codebase names, repo names, or agent/model names to the customer.
- Do not sound like a template ("I'd be happy to assist!", "As an AI…"). No filler openers.
- Prefer "you / your team" over corporate weaseling. One clear recommendation beats three vague options.
`.trim()

/** Multilingual rules — pilot language picker (14 locales). */
export const SUPPORT_MULTILINGUAL_GUIDE = `
Language (critical) — supported pilot UI locales:
English (en), Español (es), Français (fr), Deutsch (de), Português Brasil (pt-BR),
Português Portugal (pt-PT), Italiano (it), Nederlands (nl), 日本語 (ja), 한국어 (ko),
中文简体 (zh-CN), 中文繁體 (zh-TW), العربية (ar), עברית (he).
- Detect the language of the customer's question (UI locale is a hint; the question text wins if they differ).
- Analyze/diagnose in English if that helps you reason — but draft the sendable reply in the customer's question language (not English-only by default).
- Match register: floor-manager tone in that language. Do not mix languages in the customer body.
- Arabic (ar) and Hebrew (he) are RTL: write natural RTL prose; do not reverse characters artificially.
- If the question is not English, end with one short English summary in [brackets] for the human operator only.
- Runtime error stacks / fingerprints are language-agnostic; still reply in the language of any human-written question text on the ticket.
`.trim()

export interface AnswerDraftPromptOpts {
  /** e.g. "Spanish (es)" — when known from UI locale or detection. */
  replyLanguageLabel?: string | null
}

/** System prompt fragment for customer-facing answer drafts. */
export function answerDraftSystemPrompt(opts?: AnswerDraftPromptOpts): string {
  const langLine = opts?.replyLanguageLabel
    ? `\n\nTarget reply language for this ticket: ${opts.replyLanguageLabel}.`
    : ''
  return (
    'You are the support brain behind a hospitality platform. Draft a clear answer ' +
    'for the operator (William) to review and send to the customer.\n\n' +
    SUPPORT_VOICE_GUIDE +
    '\n\n' +
    SUPPORT_MULTILINGUAL_GUIDE +
    langLine +
    '\n\nIf the request needs only guidance or a configuration change, state plainly what to do. ' +
    'If it needs a code or data change, say that a quoted change request is the right path — ' +
    'do not pretend the fix already shipped. Keep it concise and ready to send.'
  )
}

/** System prompt fragment for implementation-plan drafts (sandbox / never auto-apply). */
export function planDraftSystemPrompt(): string {
  return (
    'You are a senior engineer scoping a customer change request for a hospitality platform. ' +
    'Produce a concise implementation plan for the operator to review BEFORE any work begins.\n\n' +
    SUPPORT_VOICE_GUIDE +
    '\n\nStructure the plan as: (1) what will change, (2) rough complexity tier T1–T5 and ' +
    'estimated senior-engineer hours, (3) risks and rollback approach, (4) anything that needs ' +
    'clarification. Do not write code or apply changes. Never reveal internal system or product code names.'
  )
}

export function getSupportVoiceConfig(): SupportVoiceConfig {
  const providerRaw = (process.env.SUPPORT_VOICE_PROVIDER ?? 'none').trim().toLowerCase()
  const provider: SupportVoiceProvider =
    providerRaw === 'elevenlabs' ? 'elevenlabs' : 'none'
  const voiceId = process.env.SUPPORT_VOICE_ID?.trim() || null
  const flagOn = process.env.SUPPORT_VOICE_TTS_ENABLED === 'true'
  const hasKey = Boolean(process.env.ELEVENLABS_API_KEY?.trim() || process.env.SUPPORT_VOICE_API_KEY?.trim())
  return {
    provider,
    voiceId,
    enabled: flagOn && provider === 'elevenlabs' && Boolean(voiceId) && hasKey,
    guestFacing: false,
  }
}

/**
 * Synthesize support TTS. No-op / skipped when flag off or keys missing.
 * Does not call ElevenLabs unless fully configured — safe to wire on notify path.
 */
export async function synthesizeSupportVoice(
  input: SynthesizeInput
): Promise<SynthesizeResult> {
  const cfg = getSupportVoiceConfig()
  if (!cfg.enabled) {
    return {
      ok: true,
      audio: null,
      contentType: null,
      skipped: true,
      reason: 'SUPPORT_VOICE_TTS_ENABLED not fully configured (provider/voice/key)',
    }
  }

  const text = input.text.trim().slice(0, 2500)
  if (!text) {
    return { ok: false, audio: null, contentType: null, skipped: true, reason: 'empty text' }
  }

  const apiKey =
    process.env.SUPPORT_VOICE_API_KEY?.trim() || process.env.ELEVENLABS_API_KEY?.trim()
  const voiceId = input.voiceId?.trim() || cfg.voiceId
  if (!apiKey || !voiceId) {
    return {
      ok: true,
      audio: null,
      contentType: null,
      skipped: true,
      reason: 'missing API key or voice id',
    }
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: process.env.SUPPORT_VOICE_MODEL_ID?.trim() || 'eleven_monolingual_v1',
        }),
      }
    )
    if (!res.ok) {
      return {
        ok: false,
        audio: null,
        contentType: null,
        skipped: false,
        reason: `ElevenLabs HTTP ${res.status}`,
      }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return { ok: true, audio: buf, contentType: 'audio/mpeg', skipped: false }
  } catch (err) {
    return {
      ok: false,
      audio: null,
      contentType: null,
      skipped: false,
      reason: err instanceof Error ? err.message : 'synthesize failed',
    }
  }
}

/**
 * Hook from Help Desk send-to-client / notify path.
 * Fire-and-forget safe — never throws; never blocks reply delivery.
 */
export async function maybeSynthesizeSupportReply(text: string): Promise<void> {
  try {
    const result = await synthesizeSupportVoice({ text })
    if (!result.skipped && result.ok && result.audio) {
      // Future: attach audio URL to outbox / voice note. Framework only for now.
      console.info(
        `[support-voice] synthesized ${result.audio.length} bytes (not attached yet)`
      )
    }
  } catch (err) {
    console.warn('[support-voice] hook failed (non-fatal)', err)
  }
}
