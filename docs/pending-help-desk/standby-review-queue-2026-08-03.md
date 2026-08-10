# Standby review queue sitting with Autopilot on (2026-08-03)

## Root cause (plain English)

The **Standby approved — review queue** is an **audit backlog of successful Autopilot/standby auto-answers**, not a “bugs still broken” list.

Every auto-answer sets `customer_questions.standbyApproved = true`. Nothing used to clear that flag, so items sat for days looking “unfixed” even when chat + `echo_repair_ready` already shipped. Autopilot never merges or deploys product code — UI “fixed” only when the SHA is live on `claude/laughing-noether-lSZwe`.

**Miccosukee offline + SSE 0 + outbox 41** makes it worse: replies pile in `relay_outbox` until the pilot stream reconnects, so the property also looks “not fixed.”

## What Autopilot does / does NOT

| Does | Does NOT |
|---|---|
| Auto TEXT reply after Knights safeguards | Merge / Render deploy |
| Outbox `answer_ready` (+ Echo `echo_repair_ready`) | Soft reload (default OFF) |
| Leave items in review queue for William | Auto-clear that queue (until Ack) |

## Code fixes (this change)

- `PATCH /api/support/standby/queue` — `ack` / `ack_all` clears `standbyApproved`
- Queue + KPI: 7-day window, exclude `DISMISSED`
- Dismiss question also clears `standbyApproved`
- Pilot Links UI: Ack buttons, delivery-risk banner, honest copy
- `docs/PILOT_CONNECTION.md` — Autopilot vs review queue table

## William next actions

1. Deploy this Company OS tip so Ack buttons go live.
2. Confirm Render cron `echoaurion-company-os-knight-drain` enabled + `CRON_SECRET` on every cron.
3. Bring miccosukee online (heartbeat + SSE) so outbox 41 drains.
4. Ack reviewed queue items (or **Ack all (7d)** after audit).
5. For weather / `realtime_sdp_503` / “investigate this error”: check Help Desk disposition — if **▲ Chat replied · Code not deployed**, confirm live `/api/health` SHA includes the fix; hard-refresh pilot.
6. Do not expect Autopilot alone to clear product UI bugs.

## Live health (2026-08-03)

- COS `/api/health` → `ok`, `redisFanout: configured`, `emailConfigured: true`
- luccca-web `/api/health` → `ok`, commit `f173fd65d`, branch `claude/laughing-noether-lSZwe`
- Weather 7-day (`955b003c2`) + voice SDP (`2663aa9f1`) **are ancestors of live SHA** — Class B deploy lag is **not** the weather/voice story anymore; voice UI can still fail (Realtime token / OpenAI) = Class D/ops
- Pilot links screenshot (same day): online **0**, SSE **0**, standby review **30**, miccosukee outbox **41**, autonomy **autopilot**
- Ack/PATCH for review queue is in local working tree — **not yet on origin/main / Render**
- luccca-web relay status: `configured:true` / `hasSecret:true`; COS whoami without matching bearer → 401 (secret live; byte-match still required for delivery)
