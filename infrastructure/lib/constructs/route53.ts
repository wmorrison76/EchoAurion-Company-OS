import { Construct } from 'constructs'
import {
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
} from 'aws-cdk-lib'

export interface AurionDnsProps {
  domainName: string
  alternateDomainName: string
}

// Hosted-zone lookup + wildcard ACM certificate (DNS-validated). The
// certificate must live in us-east-1 for CloudFront (CLAUDE.md §11.2).
export class AurionDns extends Construct {
  public readonly zone: route53.IHostedZone
  public readonly certificate: acm.Certificate

  constructor(scope: Construct, id: string, props: AurionDnsProps) {
    super(scope, id)

    this.zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: props.domainName,
    })

    this.certificate = new acm.Certificate(this, 'AurionCert', {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(this.zone),
    })
  }

  /** Points the apex (and www) at the CloudFront distribution. */
  public pointTo(distribution: cloudfront.IDistribution, alternate: string): void {
    new route53.ARecord(this, 'AliasRecord', {
      zone: this.zone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    })
    new route53.ARecord(this, 'WwwAliasRecord', {
      zone: this.zone,
      recordName: alternate,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    })
  }
}
