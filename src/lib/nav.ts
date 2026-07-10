import {
  Terminal,
  DollarSign,
  Users,
  TrendingUp,
  Cloud,
  Network,
  LifeBuoy,
  Radar,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  description: string
}

// CLAUDE.md §17 — order and labels are authoritative. Board Room is a DROS
// module (board-room-spec.md), placed directly under Dr. OS. Fleet Nexus is
// the operational map (Render + Support) for super-admin incident triage.
export const navItems: NavItem[] = [
  { href: '/dr-os', label: 'Dr. OS', icon: Terminal, description: 'System overview' },
  { href: '/board-room', label: 'Board Room', icon: Network, description: 'Multi-AI orchestration' },
  { href: '/fleet-nexus', label: 'Fleet Nexus', icon: Radar, description: 'Ops map · blast radius' },
  { href: '/financial', label: 'Financial', icon: DollarSign, description: 'Plaid monitor' },
  { href: '/crm', label: 'CRM', icon: Users, description: 'Pipeline' },
  { href: '/support', label: 'Support', icon: LifeBuoy, description: 'Clients · Knights gate' },
  { href: '/revenue', label: 'Revenue', icon: TrendingUp, description: 'Stripe MRR' },
  { href: '/aurion-index', label: 'AurionIndex', icon: Cloud, description: 'AWS infra' },
]
