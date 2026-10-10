# Adaptive Incumbent Gap Discovery — First Company OS Slice

**Tracking:** [master issue #11](https://github.com/wmorrison76/EchoAurion-Company-OS/issues/11).
**Scope:** Company OS / DrOS only. No changes to the MEWS/PMS agent's code, EchoVector, payroll, Phase 1–4, or source-of-truth cutover.

## Implemented in this PR

1. Authenticated DrOS schema intake: POST /api/dr-os/incumbent-gaps.
2. Accepts sanitized field descriptors only, not source records, guest/staff PII, credentials, or monetary transaction amounts.
3. Detects unknown fields, removed fields and type changes; unknown semantic mappings require review, not certification.
4. Saves schema-only version passports for every valid observation: API and adapter versions, schema hash, installation, provider, facility and observation timestamps.
5. Creates a deduplicated **internal** Help Desk SYSTEM ticket + WorkRequest FIX for each distinct schema gap. Does not trigger billed customer builds or automatic Knights execution.
6. WorkRequests carry INTERNAL_RD tracking placeholders. No guessed GL account and no automatic posting.
7. Owner-only GET /api/dr-os/incumbent-gaps?clientKey=...&providerKey=... returns field-count/version/fingerprint history, not response data.
8. R&D preview POST /api/dr-os/gap-rd-cost-preview uses existing internal AiUsageEvent metering, validates related R&D WorkRequests, rejects customer inference charges, bounds allocations at 100% and returns a non-posted GL draft.

## Example input: sanitized schema metadata (not a live MEWS response)

    {
      "clientKey": "registered-install-key",
      "providerKey": "mews",
      "facilityKey": "canonical-facility-id",
      "apiVersion": "documented-version-or-null",
      "adapterVersion": "git-sha-or-release-version",
      "fields": [
        {"path": "reservation.id", "kind": "string"},
        {"path": "reservation.newMetric", "kind": "number"}
      ],
      "mappedPaths": ["reservation.id"],
      "previousFields": [{"path": "reservation.id", "kind": "string"}],
      "criticalPaths": ["reservation.newMetric"]
    }

The values must come from an operator-reviewed, redacted schema inventory. This endpoint does NOT discover the MEWS API itself. The separate live MEWS lane must provide authorized, sanitized provider evidence. No sourceVerified or connectionVerifiedAt is set by a metadata submission.

## GL preview input

    {
      "usageIds": ["existing-internal-ai-usage-event-id"],
      "shares": [
        {
          "usageId": "existing-internal-ai-usage-event-id",
          "workRequestId": "existing-gap-workrequest-id",
          "basisPoints": 10000
        }
      ],
      "glAccount": null
    }

Response includes allocated cents, unallocated cents, per-gap costs, vendor-bill reconciliation flag and posted:false. No journal entry is created. Account selection and accounting approval remain future gates.

## Migration and tests

During sanctioned deployment run the normal Prisma migration and client generation. New table: incumbent_schema_observations. No migrations to the MEWS product database.

Focused tests:
- npm test -- src/lib/incumbent-schema-gap.test.ts src/lib/gap-rd-cost-allocation.test.ts
- npm run typecheck
- Prisma migrate/status against a disposable database
- Verify duplicate POST -> one ticket/work request, unknown tenant -> 404, unauthorized -> 401, no response values accepted, and no GL posting.

## Not delivered — do NOT report complete

- Actual live MEWS provider calls, connection verification or event/webhook discovery
- Property-local extension data storage, approved semantic mappings or runtime UI
- Generated native replacement calculations, sandbox code builds or certified signed self-install packages
- Complete per-call accounting subledger, billing reconciliation, controller-approved journal posting
- Provider-offline shadow run and Exodus certification
- Automated Knights code execution or merge into production
- Cross-customer intellectual fleet sharing of capability packages (requires further data/IP review)
