/**
 * Cron: drain TEXT knight ingest jobs (Help Desk relay path).
 * Usage: node scripts/cron-knight-drain.mjs
 */
import { cronHttpPost } from './cron-http-post.mjs'

await cronHttpPost('/api/ops/drain-knight-queue')
