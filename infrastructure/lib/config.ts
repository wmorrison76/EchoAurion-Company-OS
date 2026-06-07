export type Environment = 'production' | 'staging'

export interface AurionConfig {
  environment: Environment
  domainName: string
  alternateDomainName: string
  /** Secrets Manager secret holding the app's JSON env (CLAUDE.md §11.2). */
  appSecretName: string
  /** us-east-1 is required for the CloudFront ACM certificate. */
  certificateRegion: string
}

const BASE = {
  domainName: 'echoaurion.com',
  alternateDomainName: 'www.echoaurion.com',
  certificateRegion: 'us-east-1',
}

export function getConfig(environment: Environment): AurionConfig {
  return {
    environment,
    ...BASE,
    appSecretName: `echoaurion/${environment}`,
  }
}
