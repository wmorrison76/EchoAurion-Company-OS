import { Terminal, DollarSign, Users, TrendingUp, Cloud, type LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  description: string
}

// CLAUDE.md §17 — order and labels are authoritative.
export const navItems: NavItem[] = [
  { href: '/dr-os', label: 'Dr. OS', icon: Terminal, description: 'System overview' },
  { href: '/financial', label: 'Financial', icon: DollarSign, description: 'Plaid monitor' },
  { href: '/crm', label: 'CRM', icon: Users, description: 'Pipeline' },
  { href: '/revenue', label: 'Revenue', icon: TrendingUp, description: 'Stripe MRR' },
  { href: '/aurion-index', label: 'AurionIndex', icon: Cloud, description: 'AWS infra' },
]
