/**
 * Cron: poll CI/deploy failures + drain ingest queue.
 * Usage: node scripts/cron-ops-poll.mjs
 */
import { cronHttpPost } from './cron-http-post.mjs'

await cronHttpPost('/api/ops/poll-failures')
