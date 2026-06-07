import { Construct } from 'constructs'
import {
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_certificatemanager as acm,
  aws_elasticloadbalancingv2 as elbv2,
  aws_s3 as s3,
} from 'aws-cdk-lib'

export interface AurionCdnProps {
  loadBalancer: elbv2.ILoadBalancerV2
  assetsBucket: s3.IBucket
  certificate: acm.ICertificate
  domainNames: string[]
}

// CloudFront in front of the ALB (SSR, caching disabled) with a cached
// behavior for /_next/static/* served from S3 (CLAUDE.md §11.2).
export class AurionCdn extends Construct {
  public readonly distribution: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: AurionCdnProps) {
    super(scope, id)

    this.distribution = new cloudfront.Distribution(this, 'AurionCDN', {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(props.loadBalancer as elbv2.IApplicationLoadBalancer),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      },
      additionalBehaviors: {
        '/_next/static/*': {
          origin: new origins.S3Origin(props.assetsBucket),
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
      certificate: props.certificate,
      domainNames: props.domainNames,
    })
  }
}
