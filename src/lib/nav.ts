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
  Inbox,
  Link2,
  BookOpen,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  description: string
}

// Board Room = Knights counsel (strategy). Help Desk = live operator tickets
// (text / voice / custom builds). Support = client health + approve gate.
// Inbox = unified triage queue. Pilot links = connection hub. Fleet Nexus = ops map.
// Help Files = searchable KB / macros for Knights + send-to-client.
export const navItems: NavItem[] = [
  { href: '/dr-os', label: 'Dr. OS', icon: Terminal, description: 'System overview' },
  {
    href: '/board-room',
    label: 'Board Room',
    icon: Network,
    description: 'Knights counsel (strategy)',
  },
  { href: '/fleet-nexus', label: 'Fleet Nexus', icon: Radar, description: 'Ops map · blast radius' },
  { href: '/knowledge-plane', label: 'Knowledge Plane', icon: Brain, description: 'Resonance · learning' },
  { href: '/financial', label: 'Financial', icon: DollarSign, description: 'Plaid monitor' },
  { href: '/crm', label: 'CRM', icon: Users, description: 'Pipeline' },
  { href: '/support', label: 'Support', icon: LifeBuoy, description: 'Client health · diagnostics' },
  { href: '/support/inbox', label: 'Inbox', icon: Inbox, description: 'Unified triage queue' },
  {
    href: '/support/pilot-links',
    label: 'Pilot links',
    icon: Link2,
    description: 'Heartbeat · SSE · standby',
  },
  {
    href: '/help-desk',
    label: 'Help Desk',
    icon: Headset,
    description: 'Knights · text · voice',
  },
  {
    href: '/help-files',
    label: 'Help Files',
    icon: BookOpen,
    description: 'KB · macros · send to client',
  },
  { href: '/revenue', label: 'Revenue', icon: TrendingUp, description: 'Stripe MRR' },
  { href: '/aurion-index', label: 'AurionIndex', icon: Cloud, description: 'AWS infra' },
]
