# Marketing Attribution

EchoAurion Company OS includes lightweight first-party attribution for the public website so social posts can be correlated with website traffic.

## URL standard

Use one campaign URL per post:

```text
https://echoaurion.com/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=integration_ecosystem_2026_09&utm_content=linkedin_2026_09_18_pm
```

Instagram example:

```text
https://echoaurion.com/?utm_source=instagram&utm_medium=organic_social&utm_campaign=integration_ecosystem_2026_09&utm_content=instagram_2026_09_18_pm
```

For paid campaigns use `utm_medium=paid_social`.

### Fields

- `utm_source`: `linkedin`, `instagram`, or another traffic source.
- `utm_medium`: `organic_social` or `paid_social`.
- `utm_campaign`: stable campaign family, reused across related creative.
- `utm_content`: unique post/creative identifier. This is what lets us compare two posts inside the same campaign.
- `utm_term`: optional targeting/audience label for paid campaigns.

## What is stored

The public tracker records a PII-free event in the existing `AuditLog`:

- anonymous browser-tab session id
- source / medium
- campaign / content / term when present
- landing path only
- referring hostname only
- event timestamp from `AuditLog.createdAt`

It does **not** persist:

- IP address
- email or account identity
- full referrer URL
- arbitrary query-string values
- browser user-agent

The source IP is used only as an in-memory rate-limit key and is never written to the database. Obvious crawler user-agents are excluded.

## Dashboard

Authenticated Company OS users can open **Marketing** in the sidebar (`/marketing-analytics`) to see:

- 7-day traffic and week-over-week change
- anonymous unique sessions
- social-attributed traffic
- source breakdown
- the last 48 hours bucketed by hour in America/New_York
- campaign + post attribution
- 14-day daily traffic baseline

Use the 48-hour hourly view immediately after a post launches. Use campaign/content UTMs to determine whether a specific post actually sent traffic rather than merely coinciding with a traffic increase.

## Metricool operating rule

Every EchoAurion product post that is intended to drive site traffic should contain its platform-specific UTM URL. Industry commentary posts can link primarily to the cited article; add an EchoAurion UTM URL only when it is natural and useful rather than forcing a sales CTA into every post.
