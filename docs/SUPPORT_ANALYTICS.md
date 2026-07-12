# Support Analytics

PII-free aggregates for Dr. OS / Fleet. **No guest names, emails, or session PII** — counts, fingerprints, and `clientKey` / `productLine` only.

## API

`GET /api/dr-os/support-analytics` (admin session)

Returns:

| Field | Meaning |
|---|---|
| `ticketsByGate` | Counts by TECH / BILLING / BUILD / OTHER (+ UNSET) with shape+label |
| `errorFingerprintsTop` | Top-N ErrorPattern rows (truncated fingerprint, hitCount) |
| `mttrHoursProxy` | Mean create→resolve hours for RESOLVED tickets (90d sample) |
| `ciDeployFailCounts` | Open SYSTEM INFRA/INTEGRATION + agentWorking |
| `knightSeatDegraded` | Seats missing env keys vs total |
| `canaryVsFleet` | GLOBAL rollout stage counts |
| `deadLetterNotify` | FAILED `notify_fanout` IngestJobs |
| `byClientKey` | Open ticket counts per clientKey |

## UI

- Dr. OS → **Support & reliability** panel (`SupportReliabilityPanel`)
- Help Desk → gate filter chips + badges
- Dead-letter re-drive: `GET/POST /api/help-desk/dead-letter`

## Gates → policy

| Gate | Shape | Path |
|---|---|---|
| TECH | ◆ | Free — Knights / system |
| BILLING | ● | Billing policy (no code) |
| BUILD | ■ | Paid WorkAgreement |
| OTHER | ○ | General queue |

See `src/lib/intake-gate.ts`.
