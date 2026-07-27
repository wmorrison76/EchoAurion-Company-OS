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
| SSE answers / directives | Help Desk Approve & send, work status | No |
| `update_available` / `soft_reload` | Banner after code deploy | Only after **Apply** (or safe auto-apply with no recipe draft) |

These are **directives and messaging**, not a silent JS hot-swap of Chronos.

---

## Ideal UX for “fix landed — don’t lose my BEO / recipe”

1. Deploy finishes on Render (or William Approves an Echo TECH ticket that says the fix is live).  
2. Company OS publishes `answer_ready` + `update_available` + `soft_reload` on the relay SSE.  
3. Pilot shows **▲ Update ready** (`UpdateAvailableBanner`) and prefetches `/api/build-info`.  
4. If `recipe:draft` exists → user must confirm before reload. If not → optional safe auto-apply after ~12s.  
5. Never force-refresh mid-keystroke when a culinary draft is present.

Scaffold: `src/components/ui/UpdateAvailableBanner.tsx` (Company OS).  
Pilot: `client/components/support/UpdateAvailableBanner.tsx` + `live-update.ts`.  
Approve path: `src/lib/live-repair-delivery.ts`.

Do **not** pretend this hot-patches Chronos — it only prompts a controlled reload.

---

## Related

- Relay: `docs/RELAY_CONTRACTS.md`, `docs/PILOT_CONNECTION.md`  
- Ops deploy tickets: `docs/ERROR_CAPTURE_AND_SCOPE.md`  
- Pilot Aurum PWA already uses a confirm reload on SW update (`MobileAppShell`) — same idea, softer banner preferred for Chronos forms.
