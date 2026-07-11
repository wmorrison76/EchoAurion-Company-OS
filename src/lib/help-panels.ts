/**
 * Known panel IDs operators can open on a connected pilot via relay directive.
 * Echo-like hospitality panels + Company OS stubs. Pilot must honor
 * `{ type: "open_panel", panelId, params? }` on the wiring branch.
 */

export interface HelpPanelDef {
  id: string
  label: string
  group: 'echo' | 'company-os' | 'support'
  description: string
}

export const HELP_PANELS: HelpPanelDef[] = [
  // Echo / hospitality ops (pilot product)
  {
    id: 'beo',
    label: 'BEO',
    group: 'echo',
    description: 'Banquet Event Order viewer / print',
  },
  {
    id: 'schedule',
    label: 'Schedule',
    group: 'echo',
    description: 'Labor / event schedule',
  },
  {
    id: 'purchasing',
    label: 'Purchasing',
    group: 'echo',
    description: 'Purchasing / vendor orders',
  },
  {
    id: 'settings',
    label: 'Settings',
    group: 'echo',
    description: 'Property / app settings',
  },
  {
    id: 'support',
    label: 'Ask Support',
    group: 'support',
    description: 'In-app Ask Aurion Support panel',
  },
  {
    id: 'menu',
    label: 'Menu',
    group: 'echo',
    description: 'Menu / recipe surfaces',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    group: 'echo',
    description: 'Inventory / par levels',
  },
  {
    id: 'forecast',
    label: 'Forecast',
    group: 'echo',
    description: 'Demand / covers forecast',
  },
  {
    id: 'close',
    label: 'Close',
    group: 'echo',
    description: 'Nightly close / end-of-day',
  },
  {
    id: 'fleet',
    label: 'Fleet',
    group: 'echo',
    description: 'Fleet / multi-station status',
  },
  // Company OS operator stubs (for future embedded / companion views)
  {
    id: 'company-os.help-desk',
    label: 'Company OS · Help Desk',
    group: 'company-os',
    description: 'Operator Help Desk (stub)',
  },
  {
    id: 'company-os.dr-os',
    label: 'Company OS · Dr. OS',
    group: 'company-os',
    description: 'System overview (stub)',
  },
  {
    id: 'company-os.fleet-nexus',
    label: 'Company OS · Fleet Nexus',
    group: 'company-os',
    description: 'Ops map (stub)',
  },
  {
    id: 'company-os.pilot-links',
    label: 'Company OS · Pilot links',
    group: 'company-os',
    description: 'Connection hub (stub)',
  },
]

export const HELP_PANEL_IDS = HELP_PANELS.map((p) => p.id)

export function isKnownPanelId(panelId: string): boolean {
  return HELP_PANEL_IDS.includes(panelId)
}

export function getPanel(panelId: string): HelpPanelDef | undefined {
  return HELP_PANELS.find((p) => p.id === panelId)
}

/** Directive payload shapes pushed via RelayOutbox (type may be directive or dedicated). */
export type OpenPanelDirective = {
  type: 'open_panel'
  panelId: string
  params?: Record<string, unknown>
}

export type ShowMessageDirective = {
  type: 'show_message'
  title: string
  body: string
  severity?: 'info' | 'success' | 'warning' | 'error'
}

export type NavigateDirective = {
  type: 'navigate'
  path: string
}

export type ClientDirective = OpenPanelDirective | ShowMessageDirective | NavigateDirective
