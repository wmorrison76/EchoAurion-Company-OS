import type { KnightConfig, KnightProvider } from '@/types/board-room'
import { googleAiApiKey } from './knights'

const KNIGHT_TIMEOUT_MS = 25_000 // 25s per knight — leave headroom under Render maxDuration

export class NotConfiguredError extends Error {}

interface Prompt {
  system: string
  user: string
}

async function callPerplexity(model: string, p: Prompt, signal: AbortSignal): Promise<string> {
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) throw new NotConfiguredError('PERPLEXITY_API_KEY not set')
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Perplexity ${res.status}`)
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return body.choices?.[0]?.message?.content ?? ''
}

async function callOpenAI(model: string, p: Prompt, signal: AbortSignal): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new NotConfiguredError('OPENAI_API_KEY not set')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
    }),
    signal,
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return body.choices?.[0]?.message?.content ?? ''
}

async function callAnthropic(model: string, p: Prompt, signal: AbortSignal): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new NotConfiguredError('ANTHROPIC_API_KEY not set')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: p.system,
      messages: [{ role: 'user', content: p.user }],
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const body = (await res.json()) as { content?: Array<{ text?: string }> }
  return body.content?.map((c) => c.text ?? '').join('') ?? ''
}

async function callGoogle(model: string, p: Prompt, signal: AbortSignal): Promise<string> {
  const key = googleAiApiKey()
  if (!key) {
    throw new NotConfiguredError('GOOGLE_AI_API_KEY or GEMINI_API_KEY not set')
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: p.system }] },
      contents: [{ role: 'user', parts: [{ text: p.user }] }],
    }),
    signal,
  })
  if (!res.ok) {
    let detail = ''
    try {
      const errBody = (await res.json()) as { error?: { message?: string } }
      detail = errBody.error?.message ? `: ${errBody.error.message}` : ''
    } catch {
      /* ignore parse errors */
    }
    throw new Error(`Google AI ${res.status}${detail}`)
  }
  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return body.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? ''
}

async function callEcho(p: Prompt, signal: AbortSignal): Promise<string> {
  const url = process.env.ECHO_AI_URL
  if (!url) throw new NotConfiguredError('ECHO_AI_URL not set')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.ECHO_AI_KEY ? { Authorization: `Bearer ${process.env.ECHO_AI_KEY}` } : {}),
    },
    body: JSON.stringify({ system: p.system, message: p.user }),
    signal,
  })
  if (!res.ok) throw new Error(`Echo AI ${res.status}`)
  const body = (await res.json()) as { reply?: string; content?: string }
  return body.reply ?? body.content ?? ''
}

function route(provider: KnightProvider, model: string, p: Prompt, signal: AbortSignal): Promise<string> {
  switch (provider) {
    case 'perplexity':
      return callPerplexity(model, p, signal)
    case 'openai':
      return callOpenAI(model, p, signal)
    case 'anthropic':
      return callAnthropic(model, p, signal)
    case 'google':
      return callGoogle(model, p, signal)
    case 'echo':
      return callEcho(p, signal)
  }
}

export interface DispatchResult {
  status: 'RESPONDED' | 'UNAVAILABLE' | 'TIMEOUT' | 'ERROR'
  content: string | null
  error: string | null
  latencyMs: number
}

/** Calls one provider with the 30s per-knight timeout, normalising the result. */
export async function dispatch(config: KnightConfig, prompt: Prompt): Promise<DispatchResult> {
  const started = Date.now()
  try {
    const content = await route(config.provider, config.model, prompt, AbortSignal.timeout(KNIGHT_TIMEOUT_MS))
    return { status: 'RESPONDED', content, error: null, latencyMs: Date.now() - started }
  } catch (error) {
    const latencyMs = Date.now() - started
    if (error instanceof NotConfiguredError) {
      return { status: 'UNAVAILABLE', content: null, error: error.message, latencyMs }
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { status: 'TIMEOUT', content: null, error: 'Knight timed out (25s)', latencyMs }
    }
    return {
      status: 'ERROR',
      content: null,
      error: error instanceof Error ? error.message : 'Knight call failed',
      latencyMs,
    }
  }
}
