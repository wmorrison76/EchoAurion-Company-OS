#!/usr/bin/env node
/** Render cron: daily financial + MRR sync. */
import { cronHttpPost } from './cron-http-post.mjs'

await cronHttpPost('/api/financial/sync')
