# Fix without losing work — refresh vs real-time

**Audience:** William Morrison  
**Honest answer:** Most UI/code fixes need a deploy + user reload. We do **not** silently hot-patch Chronos in production.

---

## Today’s path (code fixes)

```
Draft PR → merge → Render (or Railway) deploy → new JS/CSS bundle
  → users still on old bundle until they refresh / reopen the app
```

- **Hot Module Reload (HMR)** = local `npm run dev` only. Not production.
- Production always ships a new build artifact. There is no magic live rewrite of broken modules in the guest’s browser.

---

## What CAN be real-time (without losing in-progress work)

| Mechanism | Examples | Wipes forms? |
|---|---|---|
| Relay `show_message` | Toast / banner copy | No |
| Relay `open_panel` | Help Desk, CSAT | No (opens chrome) |
| Config / feature flags | Soft enable/disable paths | No |
| SSE answers / directives | Ask-the-Board replies, work status | No |
| Soft “update available” banner | Ask user to save & reload | Only after **they** reload |

These are **directives and messaging**, not a silent JS hot-swap of Chronos.

---

## Ideal UX for “fix landed — don’t lose my BEO”

1. Deploy finishes on Render.  
2. Client detects new build (build id / `feature_available` / heartbeat `appVersion`) — **optional wiring**.  
3. Soft banner: **▲ Update ready — save & reload when convenient**.  
4. User saves; then taps **Reload now** or **Later**.  
5. Never force-refresh mid-keystroke if avoidable.

Scaffold: `src/components/ui/UpdateAvailableBanner.tsx` (Company OS pattern; pilot can mirror).  
Do **not** pretend this hot-patches Chronos — it only prompts a controlled reload.

---

## Related

- Relay: `docs/RELAY_CONTRACTS.md`, `docs/PILOT_CONNECTION.md`  
- Ops deploy tickets: `docs/ERROR_CAPTURE_AND_SCOPE.md`  
- Pilot Aurum PWA already uses a confirm reload on SW update (`MobileAppShell`) — same idea, softer banner preferred for Chronos forms.
