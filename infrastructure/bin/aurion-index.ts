#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { AurionIndexStack } from '../lib/aurion-index-stack'
import type { Environment } from '../lib/config'

const app = new App()

const environment = (app.node.tryGetContext('environment') as Environment) ?? 'production'

// Hosted-zone lookup + CloudFront cert require an explicit account/region env.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
}

new AurionIndexStack(app, `AurionIndex-${environment}`, { environment, env })

app.synth()
