import type { Persona } from '@/types/board-room'

// Phase 5 — Playground personas. Convening with a persona reframes the problem
// so the Board pressure-tests a decision through that lens. Personas only make
// sense in sandbox sessions (they never imply production writes).
export const PRESET_PERSONAS: Persona[] = [
  {
    id: 'skeptical_investor',
    label: 'Skeptical Investor',
    framing:
      'Evaluate this as a skeptical seed-stage investor. Stress-test the numbers, ' +
      'flag the weakest assumption, and decide whether you would write a check.',
  },
  {
    id: 'value_guest',
    label: 'Five-Star Guest',
    framing:
      'Evaluate this from the perspective of a discerning Forbes Five-Star property guest. ' +
      'Does it raise or lower the perceived quality of the experience?',
  },
  {
    id: 'ops_gm',
    label: 'Property GM',
    framing:
      'Evaluate this as the General Manager who must operationalize it on property. ' +
      'Surface staffing, cost, and rollout friction the plan glosses over.',
  },
  {
    id: 'line_cook',
    label: 'Line Cook',
    framing:
      'Evaluate this from the line during a Saturday rush. Will it actually work under ' +
      'pressure, or is it theory that breaks when tickets pile up?',
  },
]

export function findPersona(id: string | undefined): Persona | null {
  if (!id) return null
  return PRESET_PERSONAS.find((p) => p.id === id) ?? null
}

/** Prepends the persona framing to the problem (Playground only). */
export function applyPersona(problem: string, personaId: string | undefined): string {
  const persona = findPersona(personaId)
  if (!persona) return problem
  return `[Persona: ${persona.label}] ${persona.framing}\n\nProblem: ${problem}`
}
