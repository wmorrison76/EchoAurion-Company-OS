# Upstash Redis — William setup (ELI5)

**Product:** Upstash **Redis** (not Kafka, not QStash, not Vector).

**Required for deploy?** **No.** Company OS boots and deploys fine without Upstash.
When the two env vars below are unset, rate limits and relay SSE use in-memory
fallbacks on each Render instance (`src/lib/rate-limit-redis.ts`,
`src/lib/relay-pubsub-redis.ts`).

**When you need it:** Before scaling Company OS web to **2+ instances**, or when
you want shared rate limits + live SSE fan-out across replicas. See
`docs/SCALE_AND_THROTTLE.md`.

---

## 1. Create the database (Upstash console)

1. Go to [console.upstash.com](https://console.upstash.com) → **Redis**.
2. Click **+ Create Database**.
3. Name: `echoaurion-company-os` (any name is fine).
4. **Region:** pick **US East** if Render Oregon is too far — closest to Company OS.
5. Type: **Regional** (free tier is fine to start).
6. Create.

---

## 2. Copy REST credentials (not the redis:// URL)

Open the database → **REST API** tab (or **Details** → REST section).

You need exactly these two values:

| Upstash label | Render env var name |
|---|---|
| `UPSTASH_REDIS_REST_URL` | `UPSTASH_REDIS_REST_URL` |
| `UPSTASH_REDIS_REST_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` |

- URL looks like: `https://something-us1.upstash.io`
- Token is a long secret string.

Do **not** paste the `redis://` TCP connection string — the app uses HTTP REST only
(no `@upstash/redis` npm package).

---

## 3. Paste on Render (web service only)

1. [Render Dashboard](https://dashboard.render.com) → **echoaurion-company-os** (the **website**, not a cron).
2. **Environment** → **Add Environment Variable**:
   - `UPSTASH_REDIS_REST_URL` = REST URL from step 2
   - `UPSTASH_REDIS_REST_TOKEN` = REST token from step 2
3. **Save Changes** → **Manual Deploy** (or wait for auto-deploy).

### Do crons need Upstash?

**No.** Knight drain, ops-poll, financial sync, and all other crons call HTTP
endpoints on the web service. Only the **web** process reads Redis for rate limits
and relay SSE fan-out.

---

## 4. Verify (after deploy)

```bash
curl -sS https://echoaurion-company-os.onrender.com/api/health
```

When Upstash is wired, expect:

```json
"redisFanout": "configured"
```

When unset (still OK):

```json
"redisFanout": "memory-only"
```

Deploy success does **not** depend on this field.

---

## Quick reference

| Question | Answer |
|---|---|
| Which Upstash product? | **Redis** |
| Env var names on web? | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Crons need them? | **No** |
| Required to deploy? | **No** — optional scale feature |
| Required for 2+ web instances? | **Yes** (shared limits + SSE) |
