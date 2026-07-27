import { Construct } from 'constructs'
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_ecr as ecr,
  aws_certificatemanager as acm,
  aws_secretsmanager as sm,
} from 'aws-cdk-lib'

export interface AurionServiceProps {
  vpc: ec2.IVpc
  certificate: acm.ICertificate
  /** Single JSON secret holding the app env (CLAUDE.md §11.2). */
  appSecret: sm.ISecret
}

// Fargate behind an ALB, 0.5 vCPU / 1GB, CPU autoscaling 1→4 (CLAUDE.md §11.2).
export class AurionService extends Construct {
  public readonly service: ecsPatterns.ApplicationLoadBalancedFargateService
  public readonly repository: ecr.Repository

  constructor(scope: Construct, id: string, props: AurionServiceProps) {
    super(scope, id)

    this.repository = new ecr.Repository(this, 'AurionRepo', {
      repositoryName: 'echoaurion-company-os',
      imageScanOnPush: true,
    })

    const cluster = new ecs.Cluster(this, 'AurionCluster', { vpc: props.vpc })

    const taskDef = new ecs.FargateTaskDefinition(this, 'AurionTaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
    })

    const fromSecret = (field: string) => ecs.Secret.fromSecretsManager(props.appSecret, field)

    taskDef.addContainer('NextJsContainer', {
      image: ecs.ContainerImage.fromEcrRepository(this.repository),
      portMappings: [{ containerPort: 3000 }],
      environment: { NODE_ENV: 'production' },
      secrets: {
        DATABASE_URL: fromSecret('DATABASE_URL'),
        NEXTAUTH_SECRET: fromSecret('NEXTAUTH_SECRET'),
        PLAID_CLIENT_ID: fromSecret('PLAID_CLIENT_ID'),
        PLAID_SECRET: fromSecret('PLAID_SECRET'),
        STRIPE_SECRET_KEY: fromSecret('STRIPE_SECRET_KEY'),
        MERCURY_API_KEY: fromSecret('MERCURY_API_KEY'),
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'echoaurion' }),
    })

    this.service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'AurionService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      publicLoadBalancer: true,
      certificate: props.certificate,
      redirectHTTP: true,
    })

    this.service.targetGroup.configureHealthCheck({ path: '/api/health' })

    this.service.service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 4 }).scaleOnCpuUtilization(
      'CpuScaling',
      { targetUtilizationPercent: 70 }
    )
  }
}
