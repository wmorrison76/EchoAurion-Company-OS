#!/usr/bin/env node
/** Render cron: dispatch due SCHEDULED maintenance notices. */
import { cronHttpPost } from './cron-http-post.mjs'

await cronHttpPost('/api/maintenance/dispatch')
