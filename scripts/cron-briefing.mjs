#!/usr/bin/env node
/** Render cron: daily Board Room briefing. */
import { cronHttpPost } from './cron-http-post.mjs'

await cronHttpPost('/api/board-room/briefing')
