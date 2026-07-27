import { Construct } from 'constructs'
import { aws_ec2 as ec2 } from 'aws-cdk-lib'

// Two-AZ VPC with public, private-with-egress, and isolated subnets
// (CLAUDE.md §11.2). NAT gateway dominates early cost — one AZ only.
export class AurionVpc extends Construct {
  public readonly vpc: ec2.Vpc

  constructor(scope: Construct, id: string) {
    super(scope, id)

    this.vpc = new ec2.Vpc(this, 'AurionVPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 28 },
      ],
    })
  }
}
