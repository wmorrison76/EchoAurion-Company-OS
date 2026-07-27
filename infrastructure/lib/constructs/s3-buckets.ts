import { Construct } from 'constructs'
import { Duration, Stack, aws_s3 as s3 } from 'aws-cdk-lib'

// Assets, backups, and logs buckets — all public access blocked (§11.2).
export class AurionBuckets extends Construct {
  public readonly assets: s3.Bucket
  public readonly backups: s3.Bucket
  public readonly logs: s3.Bucket

  constructor(scope: Construct, id: string) {
    super(scope, id)
    const account = Stack.of(this).account

    this.assets = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: `echoaurion-assets-${account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    })

    this.backups = new s3.Bucket(this, 'BackupsBucket', {
      bucketName: `echoaurion-backups-${account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: Duration.days(90) }],
    })

    this.logs = new s3.Bucket(this, 'LogsBucket', {
      bucketName: `echoaurion-logs-${account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: Duration.days(30) }],
    })
  }
}
