/**
 * Error taxonomy — category + productLine for fleet learning (no PII).
 * Aggregates into ErrorPattern for Knowledge Plane / Help Desk analytics.
 */

export type ErrorCategory =
  | 'UI'
  | 'API'
  | 'AUTH'
  | 'DATA'
  | 'INTEGRATION'
  | 'INFRA'
  | 'UNKNOWN'

export type ProductLine =
  | 'echoaurion'
  | 'company-os'
  | 'aurion-index'
  | 'unknown'

export const PRODUCT_LINES: ProductLine[] = [
  'echoaurion',
  'company-os',
  'aurion-index',
  'unknown',
]

export const ERROR_CATEGORIES: ErrorCategory[] = [
  'UI',
  'API',
  'AUTH',
  'DATA',
  'INTEGRATION',
  'INFRA',
  'UNKNOWN',
]

const CATEGORY_PATTERNS: Array<{ category: ErrorCategory; re: RegExp }> = [
  {
    category: 'AUTH',
    re: /(auth|unauthorized|forbidden|jwt|session|credential|login|NEXTAUTH|password)/i,
  },
  {
    category: 'DATA',
    re: /(prisma|postgres|neon|sql|migration|constraint|deadlock|ECONNREFUSED.*5432)/i,
  },
  {
    category: 'INTEGRATION',
    re: /(plaid|stripe|mercury|github|render|oauth|webhook|third.?party)/i,
  },
  {
    category: 'INFRA',
    re: /(ECONNRESET|ETIMEDOUT|ENOTFOUND|502|503|504|cloudflare|ecs|rds|deploy)/i,
  },
  {
    category: 'API',
    re: /(fetch failed|HTTP \d{3}|\/api\/|route handler|TypeError: Failed to fetch)/i,
  },
  {
    category: 'UI',
    re: /(LanguageProvider|useTranslation|React|hydrat|ChunkLoad|render|component|panel)/i,
  },
]

export function classifyErrorCategory(input: {
  message: string
  stack?: string | null
  errorClass?: string | null
  moduleHint?: string | null
}): ErrorCategory {
  const blob = `${input.message}\n${input.stack ?? ''}\n${input.errorClass ?? ''}\n${input.moduleHint ?? ''}`
  for (const { category, re } of CATEGORY_PATTERNS) {
    if (re.test(blob)) return category
  }
  return 'UNKNOWN'
}

export function normalizeProductLine(raw: string | null | undefined): ProductLine {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'echoaurion' || v === 'luccca' || v === 'pilot' || v === 'product') {
    return 'echoaurion'
  }
  if (v === 'company-os' || v === 'company_os' || v === 'companyos') return 'company-os'
  if (v === 'aurion-index' || v === 'aurionindex' || v === 'aws') return 'aurion-index'
  if (PRODUCT_LINES.includes(v as ProductLine)) return v as ProductLine
  return 'echoaurion' // pilot default
}

export function categoryBadgeLabel(c: ErrorCategory | null | undefined): string {
  return c ?? 'UNKNOWN'
}
