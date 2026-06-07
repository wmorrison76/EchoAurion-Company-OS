# AurionIndex — AWS CDK Infrastructure

AWS CDK (TypeScript) definition of EchoAurion's production infrastructure
(CLAUDE.md §11). The companion read-only panel lives at `/aurion-index` in the
Next.js app.

## Stack — `AurionIndex-<environment>`

| Construct | Resource |
|---|---|
| `AurionVpc` | 2-AZ VPC, 1 NAT gateway, public / private-with-egress / isolated subnets |
| `AurionDatabase` | RDS PostgreSQL 16, db.t4g.small, isolated subnets, 7-day backups, deletion protection |
| `AurionBuckets` | S3 assets (versioned), backups (90-day), logs (30-day) — public access blocked |
| `AurionDns` | Route 53 hosted-zone lookup + wildcard ACM cert (DNS-validated, us-east-1) |
| `AurionService` | ECR repo + ECS Fargate (0.5 vCPU / 1 GB) behind an ALB, CPU autoscaling 1→4, `/api/health` check |
| `AurionCdn` | CloudFront — ALB origin (SSR, caching disabled) + `/_next/static/*` from S3 |

All app secrets come from a single JSON secret in Secrets Manager:
`echoaurion/<environment>` (keys: `DATABASE_URL`, `NEXTAUTH_SECRET`,
`PLAID_CLIENT_ID`, `PLAID_SECRET`, `STRIPE_SECRET_KEY`, `MERCURY_API_KEY`).

## Prerequisites

- AWS credentials with permissions to create the above resources
- A Route 53 public hosted zone for `echoaurion.com` (the cert + alias records depend on it)
- The app secret `echoaurion/<environment>` created in Secrets Manager
- Node 20+, then `npm install` in this directory

## Commands

```bash
cd infrastructure
npm install
npm run build                       # tsc — compile + type-check (no AWS creds needed)

# The following require AWS credentials + an account/region:
export CDK_DEFAULT_ACCOUNT=<account-id>
export CDK_DEFAULT_REGION=us-east-1
npx cdk bootstrap                    # once per account/region
npm run synth                        # cdk synth — emit CloudFormation
npm run diff                         # cdk diff
npm run deploy                       # cdk deploy -- --context environment=production
```

Select the environment with CDK context: `--context environment=staging`
(defaults to `production`).

> The ACM certificate for CloudFront must be in **us-east-1**. Pin
> `aws-cdk-lib`/`aws-cdk` to exact versions to avoid bootstrap/deploy drift
> (CLAUDE.md §22.10).

## Estimated cost

~$109/month — NAT Gateway (~$32) dominates early. See `/aurion-index` in the
app for the full breakdown and the migration checklist.
