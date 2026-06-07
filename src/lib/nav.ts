import {
  Terminal,
  DollarSign,
  Users,
  TrendingUp,
  Cloud,
  Network,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  description: string
}

// CLAUDE.md §17 — order and labels are authoritative. Board Room is a DROS
// module (board-room-spec.md), placed directly under Dr. OS.
export const navItems: NavItem[] = [
  { href: '/dr-os', label: 'Dr. OS', icon: Terminal, description: 'System overview' },
  { href: '/board-room', label: 'Board Room', icon: Network, description: 'Multi-AI orchestration' },
  { href: '/financial', label: 'Financial', icon: DollarSign, description: 'Plaid monitor' },
  { href: '/crm', label: 'CRM', icon: Users, description: 'Pipeline' },
  { href: '/revenue', label: 'Revenue', icon: TrendingUp, description: 'Stripe MRR' },
  { href: '/aurion-index', label: 'AurionIndex', icon: Cloud, description: 'AWS infra' },
]
