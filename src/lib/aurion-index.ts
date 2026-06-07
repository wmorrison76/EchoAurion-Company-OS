// Read-only AurionIndex panel data (CLAUDE.md §11.3, §11.4). Static until the
// stack is deployed and a deploy record is written back to the DB.

export interface CostRow {
  service: string
  tier: string
  monthly: number
}

export const COST_TABLE: CostRow[] = [
  { service: 'ECS Fargate', tier: '0.5 vCPU / 1GB, 1 task', monthly: 10 },
  { service: 'RDS PostgreSQL', tier: 'db.t4g.small, 20GB', monthly: 28 },
  { service: 'NAT Gateway', tier: '1 AZ', monthly: 32 },
  { service: 'Application Load Balancer', tier: '1 LCU baseline', monthly: 18 },
  { service: 'CloudFront', tier: '1TB transfer', monthly: 9 },
  { service: 'S3 (3 buckets)', tier: '10GB + requests', monthly: 5 },
  { service: 'ACM', tier: 'Free', monthly: 0 },
  { service: 'Route 53', tier: '1 hosted zone', monthly: 1 },
  { service: 'Secrets Manager', tier: '5 secrets', monthly: 3 },
  { service: 'CloudWatch Logs', tier: '5GB', monthly: 3 },
]

export const COST_TOTAL = COST_TABLE.reduce((s, r) => s + r.monthly, 0)

export interface StackResource {
  name: string
  detail: string
}

export const STACK_RESOURCES: StackResource[] = [
  { name: 'VPC', detail: '2 AZ · 1 NAT · public / private / isolated subnets' },
  { name: 'ECS Fargate', detail: '0.5 vCPU / 1GB · ALB · autoscale 1→4 @ 70% CPU' },
  { name: 'RDS PostgreSQL 16', detail: 'db.t4g.small · isolated · 7-day backups' },
  { name: 'CloudFront + S3', detail: 'SSR origin + cached /_next/static/*' },
  { name: 'Route 53 + ACM', detail: 'echoaurion.com · wildcard cert (us-east-1)' },
  { name: 'Secrets Manager', detail: 'echoaurion/<environment> JSON secret' },
]

export interface ChecklistItem {
  label: string
  done: boolean
}

// Pre-migration state — all unchecked (CLAUDE.md §11.4).
export const MIGRATION_CHECKLIST: ChecklistItem[] = [
  { label: 'ECS cluster deployed', done: false },
  { label: 'RDS instance running', done: false },
  { label: 'Secrets migrated', done: false },
  { label: 'DNS cutover complete', done: false },
  { label: 'Neon → RDS data migration validated', done: false },
]
