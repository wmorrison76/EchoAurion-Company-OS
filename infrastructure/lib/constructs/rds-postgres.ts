import { Construct } from 'constructs'
import { Duration, aws_ec2 as ec2, aws_rds as rds, aws_secretsmanager as sm } from 'aws-cdk-lib'

export interface AurionDatabaseProps {
  vpc: ec2.IVpc
}

// PostgreSQL 16 on db.t4g.small in isolated subnets (CLAUDE.md §11.2).
// multiAz off until revenue justifies it.
export class AurionDatabase extends Construct {
  public readonly instance: rds.DatabaseInstance
  public readonly secret: sm.ISecret

  constructor(scope: Construct, id: string, props: AurionDatabaseProps) {
    super(scope, id)

    const credentials = rds.Credentials.fromGeneratedSecret('echoaurion', {
      secretName: 'echoaurion/rds-credentials',
    })

    this.instance = new rds.DatabaseInstance(this, 'AurionRDS', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      databaseName: 'echoaurion',
      credentials,
      allocatedStorage: 20,
      backupRetention: Duration.days(7),
      deletionProtection: true,
      multiAz: false,
    })

    this.secret = this.instance.secret!
  }
}
