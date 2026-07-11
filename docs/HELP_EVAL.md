# Help Desk evaluation harness

Sandbox scoring for the support classifier (+ optional Knights draft).

## Models

- `HelpEvalCase` — prompt, expectedChannel, mustInclude[], mustNotInclude[], expectedRecommendation?
- `HelpEvalRun` — score, totals, results JSON

Seed: ~18 cases in `src/lib/help-eval.ts` (`EVAL_CASE_SEEDS`), upserted on first run.

## API

```http
GET  /api/help-desk/eval/run   → latest run (or null)
POST /api/help-desk/eval/run   { "withDrafts": false }
```

`withDrafts: true` calls `draftAnswer` for TEXT cases (slower; needs knight API keys).

## Scoring

Each case passes when:

1. `mustInclude` strings appear in classifier label/hint/reason (+ draft if present)
2. `mustNotInclude` strings do **not** appear in classifier/draft output
3. `expectedRecommendation` matches when set

Score = `passed / total * 100`.

## UI

`/lab/elite` shows last score and has a **Eval suite run** self-test button.

## Notes

- Never writes to product DB or opens PRs
- Actor audited as `help.eval.run`
