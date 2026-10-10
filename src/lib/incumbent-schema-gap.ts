/**
 * Incumbent API schema drift and capability-gap analysis.
 * Inputs are FIELD DESCRIPTORS ONLY. Never send provider response values, PII,
 * credentials, folios, employee records, or samples to Company OS.
 *
 * Detection is deterministic, not an assertion of semantic equivalence:
 * unknown mappings and breakages require Knights/human review.
 */
import { createHash } from 'node:crypto'

export type FieldKind = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'unknown'
export type SchemaField = { path: string; kind: FieldKind }

export interface SchemaObservation {
  providerKey: string
  facilityKey: string
  apiVersion: string | null
  adapterVersion: string
  fields: readonly SchemaField[]
  /** Explicitly verified mapped paths in Echo's current adapter, not LLM guesses. */
  mappedPaths: readonly string[]
  /** Previous observed provider shape. Empty means a first observation. */
  previousFields?: readonly SchemaField[]
  /** Criticality is supplied by the domain owner; it is never inferred from names. */
  criticalPaths?: readonly string[]
}

export interface SchemaGapReport {
  schemaHash: string
  fingerprint: string
  providerKey: string
  facilityKey: string
  apiVersion: string | null
  adapterVersion: string
  fieldCount: number
  unmapped: SchemaField[]
  added: SchemaField[]
  removed: SchemaField[]
  typeChanged: Array<{ path: string; before: FieldKind; after: FieldKind }>
  criticalGaps: string[]
  status: 'NO_GAP' | 'MAPPING_REVIEW' | 'BREAKING_REVIEW'
  /** Schema inventory is not proof of a verified provider sync or a built capability. */
  continuityCertified: false
  sourceVerified: false
}

const PATH = /^[A-Za-z_][A-Za-z0-9_.\[\]-]{0,127}$/

function assertFieldList(fields: readonly SchemaField[], label: string): Map<string, FieldKind> {
  if (fields.length > 500) throw new Error(label + '_TOO_LARGE')
  const out = new Map<string, FieldKind>()
  for (const item of fields) {
    if (!item || !PATH.test(item.path) ||
      !['string', 'number', 'boolean', 'array', 'object', 'null', 'unknown'].includes(item.kind) ||
      out.has(item.path)) {
      throw new Error(label + '_INVALID_OR_DUPLICATE')
    }
    out.set(item.path, item.kind)
  }
  return out
}

function assertPaths(paths: readonly string[], label: string): Set<string> {
  if (paths.length > 500 || paths.some(p => typeof p !== 'string' || !PATH.test(p))) {
    throw new Error(label + '_INVALID')
  }
  return new Set(paths)
}

function ordered(map: Map<string, FieldKind>): SchemaField[] {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([path, kind]) => ({ path, kind }))
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function analyzeIncumbentSchema(input: SchemaObservation): SchemaGapReport {
  const fields = assertFieldList(input.fields, 'OBSERVATION')
  if (!fields.size) throw new Error('OBSERVATION_EMPTY')
  const prior = assertFieldList(input.previousFields ?? [], 'PREVIOUS')
  const mapped = assertPaths(input.mappedPaths, 'MAPPINGS')
  const critical = assertPaths(input.criticalPaths ?? [], 'CRITICAL_PATHS')
  const current = ordered(fields)
  const unmapped = current.filter(f => !mapped.has(f.path))
  const added = current.filter(f => !prior.has(f.path))
  const removed = ordered(prior).filter(f => !fields.has(f.path))
  const typeChanged = current.filter(f => prior.has(f.path) && prior.get(f.path) !== f.kind)
    .map(f => ({ path: f.path, before: prior.get(f.path)!, after: f.kind }))
  const allGapPaths = new Set([
    ...unmapped.map(f => f.path),
    ...removed.map(f => f.path),
    ...typeChanged.map(f => f.path),
  ])
  const criticalGaps = [...critical].filter(p => allGapPaths.has(p)).sort()
  const schemaHash = sha256(current)
  const fingerprint = sha256({
    providerKey: input.providerKey,
    facilityKey: input.facilityKey,
    apiVersion: input.apiVersion,
    schemaHash,
    unmapped: unmapped.map(f => f.path),
    removed: removed.map(f => f.path),
    typeChanged,
  })
  return {
    schemaHash,
    fingerprint,
    providerKey: input.providerKey,
    facilityKey: input.facilityKey,
    apiVersion: input.apiVersion,
    adapterVersion: input.adapterVersion,
    fieldCount: current.length,
    unmapped,
    added,
    removed,
    typeChanged,
    criticalGaps,
    status: removed.length || typeChanged.length ? 'BREAKING_REVIEW'
      : unmapped.length ? 'MAPPING_REVIEW' : 'NO_GAP',
    continuityCertified: false,
    sourceVerified: false,
  }
}
