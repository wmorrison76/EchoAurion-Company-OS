import {
  Terminal,
  DollarSign,
  Users,
  TrendingUp,
  Cloud,
  Network,
  LifeBuoy,
  Headset,
  Radar,
  Brain,
  Link2,
  BookOpen,
  Megaphone,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  description: string
}

// Official ticket path: Help Desk. Support = client health (not tickets).
// Pilot links = heartbeat / SSE / Ack. Inbox stays at /support/inbox but is
// not in the sidebar — same work as Help Desk with extra hops.
// Board Room = Knights counsel (strategy). Fleet Nexus = ops map.
// Help Files = searchable KB / macros. Maintenance = downtime notices.
export const navItems: NavItem[] = [
  { href: '/dr-os', label: 'Dr. OS', icon: Terminal, description: 'System overview' },
  {
    href: '/help-desk',
    label: 'Help Desk',
    icon: Headset,
    description: 'Tickets · start here',
  },
  {
    href: '/support/pilot-links',
    label: 'Pilot links',
    icon: Link2,
    description: 'Heartbeat · SSE · Ack',
  },
  { href: '/support', label: 'Support', icon: LifeBuoy, description: 'Client health (not tickets)' },
  {
    href: '/help-files',
    label: 'Help Files',
    icon: BookOpen,
    description: 'KB · macros · send to client',
  },
  { href: '/financial', label: 'Financial', icon: DollarSign, description: 'Plaid monitor' },
  { href: '/crm', label: 'CRM', icon: Users, description: 'Pipeline' },
  { href: '/revenue', label: 'Revenue', icon: TrendingUp, description: 'Stripe MRR' },
  {
    href: '/board-room',
    label: 'Board Room',
    icon: Network,
    description: 'Knights counsel (strategy)',
  },
  { href: '/fleet-nexus', label: 'Fleet Nexus', icon: Radar, description: 'Ops map · blast radius' },
  { href: '/knowledge-plane', label: 'Knowledge Plane', icon: Brain, description: 'Keyword retrieve · embeddings deferred' },
  {
    href: '/maintenance',
    label: 'Maintenance',
    icon: Megaphone,
    description: 'Notices · pilot blast',
  },
  { href: '/aurion-index', label: 'AurionIndex', icon: Cloud, description: 'AWS checklist · not live' },
]
