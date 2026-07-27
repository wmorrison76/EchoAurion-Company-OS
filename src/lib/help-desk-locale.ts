/**
 * Multilingual Help Desk → Knights.
 *
 * Pilot UI ships ~14 locales (see Echo_Aurion-LUCCCA_Framework client/i18n).
 * Errors/stacks are language-agnostic; free-text questions are not.
 * We resolve UI locale from relay context + lightweight script detection,
 * then instruct Knights to analyze in English if needed and reply in the
 * customer's question language.
 */

/** Pilot UI language codes (aligned with product i18n LanguageCode). */
export const PILOT_UI_LOCALES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt-BR',
  'pt-PT',
  'nl',
  'ja',
  'zh-CN',
  'zh-TW',
  'ko',
  'ar',
  'he',
] as const

export type PilotUiLocale = (typeof PILOT_UI_LOCALES)[number]

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  'pt-BR': 'Portuguese (Brazil)',
  'pt-PT': 'Portuguese (Portugal)',
  pt: 'Portuguese',
  nl: 'Dutch',
  ja: 'Japanese',
  'zh-CN': 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  he: 'Hebrew',
}

export interface HelpDeskLanguageResolution {
  /** UI chrome locale from pilot (if provided). */
  uiLocale: string | null
  /** Best-effort language of the question text. */
  questionLocale: string
  /** Locale Knights should write the customer-facing reply in. */
  replyLocale: string
  /** Human label for reply locale. */
  replyLabel: string
  /** How we decided. */
  source: 'context' | 'script' | 'default_en'
  /** True when reply should not be forced to English. */
  nonEnglish: boolean
}

function normalizeLocale(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/_/g, '-')
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  // Exact / known pilot codes (case-insensitive)
  const exact = PILOT_UI_LOCALES.find((c) => c.toLowerCase() === lower)
  if (exact) return exact
  // zh → zh-CN default
  if (lower === 'zh') return 'zh-CN'
  if (lower === 'pt') return 'pt-BR'
  // BCP-47 primary subtag
  const primary = lower.split('-')[0]
  if (primary === 'zh') return lower.includes('tw') || lower.includes('hant') ? 'zh-TW' : 'zh-CN'
  if (primary === 'pt') return lower.includes('pt') && !lower.includes('br') ? 'pt-PT' : 'pt-BR'
  const knownPrimary = PILOT_UI_LOCALES.find((c) => c.toLowerCase() === primary)
  return knownPrimary ?? (primary.length === 2 || primary.length === 3 ? primary : null)
}

function localeFromContext(context: unknown): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  const c = context as Record<string, unknown>
  return (
    normalizeLocale(c.locale) ??
    normalizeLocale(c.uiLocale) ??
    normalizeLocale(c.language) ??
    normalizeLocale(c.lang)
  )
}

/**
 * Lightweight script / character-class detection — no external API.
 * Prefer UI locale when the text looks compatible; otherwise override.
 */
export function detectQuestionLocale(text: string, uiLocale?: string | null): string {
  const sample = text.slice(0, 800)
  if (!sample.trim()) return uiLocale ?? 'en'

  const arabic = (sample.match(/[\u0600-\u06FF]/g) ?? []).length
  const hebrew = (sample.match(/[\u0590-\u05FF]/g) ?? []).length
  const hangul = (sample.match(/[\uAC00-\uD7AF]/g) ?? []).length
  const hiragana = (sample.match(/[\u3040-\u309F]/g) ?? []).length
  const katakana = (sample.match(/[\u30A0-\u30FF]/g) ?? []).length
  const cjk = (sample.match(/[\u4E00-\u9FFF]/g) ?? []).length
  const letters = (sample.match(/\p{L}/gu) ?? []).length || 1

  if (arabic / letters > 0.15) return 'ar'
  if (hebrew / letters > 0.15) return 'he'
  if (hangul / letters > 0.1) return 'ko'
  if ((hiragana + katakana) / letters > 0.05) return 'ja'
  if (cjk / letters > 0.15) {
    // Prefer UI zh variant when chrome is Chinese; else Simplified default.
    if (uiLocale === 'zh-TW' || uiLocale === 'zh-CN') return uiLocale
    return 'zh-CN'
  }

  // Latin-script: trust UI locale when non-English; else English.
  if (uiLocale && uiLocale !== 'en') return uiLocale
  return 'en'
}

export function resolveHelpDeskLanguage(input: {
  text: string
  context?: unknown
}): HelpDeskLanguageResolution {
  const uiLocale = localeFromContext(input.context)
  const fromScript = detectQuestionLocale(input.text, uiLocale)

  let questionLocale: string
  let source: HelpDeskLanguageResolution['source']

  if (uiLocale && fromScript === 'en' && uiLocale !== 'en') {
    // Latin question while UI is e.g. Spanish — still prefer UI for hospitality floor.
    questionLocale = uiLocale
    source = 'context'
  } else if (fromScript !== 'en' || !uiLocale) {
    questionLocale = fromScript
    source = fromScript === 'en' && !uiLocale ? 'default_en' : uiLocale && fromScript === uiLocale ? 'context' : 'script'
  } else {
    questionLocale = uiLocale
    source = 'context'
  }

  // If script strongly disagrees with UI (e.g. UI=en, text=Arabic), use script.
  if (uiLocale && fromScript !== 'en' && fromScript !== uiLocale) {
    const strong =
      fromScript === 'ar' ||
      fromScript === 'he' ||
      fromScript === 'ja' ||
      fromScript === 'ko' ||
      fromScript.startsWith('zh')
    if (strong) {
      questionLocale = fromScript
      source = 'script'
    }
  }

  const replyLocale = questionLocale
  const replyLabel = LOCALE_LABELS[replyLocale] ?? replyLocale
  return {
    uiLocale,
    questionLocale,
    replyLocale,
    replyLabel,
    source,
    nonEnglish: replyLocale !== 'en',
  }
}

/** Prompt block injected into Knights user prompt. */
export function multilingualPromptBlock(lang: HelpDeskLanguageResolution): string {
  const lines = [
    '## Language (Help Desk multilingual)',
    lang.uiLocale
      ? `Pilot UI locale: ${lang.uiLocale}${LOCALE_LABELS[lang.uiLocale] ? ` (${LOCALE_LABELS[lang.uiLocale]})` : ''}`
      : 'Pilot UI locale: (not provided)',
    `Detected question language: ${lang.questionLocale} (${lang.replyLabel}) [source: ${lang.source}]`,
    `Reply language: write the customer-facing draft in ${lang.replyLabel} (${lang.replyLocale}).`,
    'If you need to reason about the product, do so internally in English — but the draft William will send must match the customer’s language.',
    lang.nonEnglish
      ? 'Also add one short English operator note in [brackets] at the end for William only (not for the customer body above the note).'
      : 'Customer language appears English — draft in clear English.',
  ]
  return lines.join('\n')
}

export function localeLabel(code: string): string {
  return LOCALE_LABELS[code] ?? code
}
