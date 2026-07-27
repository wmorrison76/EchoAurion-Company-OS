import { Construct } from 'constructs'
import { Stack, StackProps, Tags, CfnOutput, aws_secretsmanager as sm } from 'aws-cdk-lib'
import { AurionVpc } from './constructs/vpc'
import { AurionDatabase } from './constructs/rds-postgres'
import { AurionBuckets } from './constructs/s3-buckets'
import { AurionDns } from './constructs/route53'
import { AurionService } from './constructs/ecs-fargate'
import { AurionCdn } from './constructs/cloudfront'
import { getConfig, type Environment } from './config'

export interface AurionIndexStackProps extends StackProps {
  environment: Environment
}

export class AurionIndexStack extends Stack {
  constructor(scope: Construct, id: string, props: AurionIndexStackProps) {
    super(scope, id, props)
    const config = getConfig(props.environment)

    // Every resource is tagged (CLAUDE.md §11.2).
    Tags.of(this).add('Project', 'EchoAurion')
    Tags.of(this).add('Environment', props.environment)
    Tags.of(this).add('ManagedBy', 'CDK')

    const appSecret = sm.Secret.fromSecretNameV2(this, 'AppSecrets', config.appSecretName)

    const network = new AurionVpc(this, 'Network')
    const database = new AurionDatabase(this, 'Database', { vpc: network.vpc })
    const buckets = new AurionBuckets(this, 'Buckets')
    const dns = new AurionDns(this, 'Dns', {
      domainName: config.domainName,
      alternateDomainName: config.alternateDomainName,
    })

    const service = new AurionService(this, 'Service', {
      vpc: network.vpc,
      certificate: dns.certificate,
      appSecret,
    })
    // The app reaches RDS over the VPC.
    database.instance.connections.allowDefaultPortFrom(service.service.service)

    const cdn = new AurionCdn(this, 'Cdn', {
      loadBalancer: service.service.loadBalancer,
      assetsBucket: buckets.assets,
      certificate: dns.certificate,
      domainNames: [config.domainName, config.alternateDomainName],
    })

    dns.pointTo(cdn.distribution, config.alternateDomainName)

    new CfnOutput(this, 'EcrRepositoryUri', { value: service.repository.repositoryUri })
    new CfnOutput(this, 'LoadBalancerDns', {
      value: service.service.loadBalancer.loadBalancerDnsName,
    })
    new CfnOutput(this, 'DistributionDomain', { value: cdn.distribution.distributionDomainName })
    new CfnOutput(this, 'RdsEndpoint', {
      value: database.instance.dbInstanceEndpointAddress,
    })
  }
}
