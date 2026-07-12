# Support Voice Pack

Separate from guest concierge and Chef Echo / Alexis operator voices.

## Persona

- Hospitality floor operator: warm, clear, short paragraphs
- Empathy first, then concrete next steps
- Never invent product capabilities; never expose internal system names
- **Never guest-facing by default** — Help Desk replies and future phone IVR only

Text tone guide: `SUPPORT_VOICE_GUIDE` in `src/lib/support-voice.ts` (injected into Knights drafts).

## When used

| Surface | TTS? | Notes |
|---|---|---|
| Help Desk send-to-client | Optional | Hook `maybeSynthesizeSupportReply` — feature-flagged |
| Future phone IVR | Planned | Same voice pack as support, not guest |
| Guest / Chef Echo | **No** | Different env / voice IDs |

## Env (Company OS)

```bash
SUPPORT_VOICE_PROVIDER=elevenlabs   # or none
SUPPORT_VOICE_ID=                   # ElevenLabs voice id for support only
SUPPORT_VOICE_TTS_ENABLED=true      # must be true to call provider
SUPPORT_VOICE_API_KEY=              # or reuse ELEVENLABS_API_KEY
# SUPPORT_VOICE_MODEL_ID=eleven_monolingual_v1
```

If any of provider / voice / key / flag is missing → **no-op** (reply delivery still succeeds).

## Stub

`synthesizeSupportVoice()` / `maybeSynthesizeSupportReply()` — interfaces + ElevenLabs call when configured; audio attach to outbox is TODO.
