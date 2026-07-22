# V116 – Candidate Decision Diagnostics

This release adds diagnostic logging only. It does not intentionally change product selection thresholds, fallback order, retry behavior, or campaign scoring.

## What is saved

For every Store Map product that reaches campaign evaluation, the automation run metadata now records:

- product title, URL, image, source shelf and discovery source
- technical product verification state
- GPT-4.1 mini score, verdict and reason
- GPT-5.5 score, verdict and reason when escalation occurs
- final AI score, verdict, model and reason
- heuristic campaign score and campaign signal counts
- whether the product passed the campaign-safe filter
- whether it had been used in the catalog or recent history
- whether its image was already used in the current worker
- whether it remained fresh and eligible
- provisional rank and final diagnostic decision
- exact rejection reason codes

The data is stored in:

`automation_run_logs.metadata.product_engine_diagnostics.storeMap.campaign_candidate_decisions`

A count summary is stored in:

`automation_run_logs.metadata.product_engine_diagnostics.storeMap.campaign_candidate_decision_summary`

No SQL migration is required because the data uses the existing JSONB `metadata` column.

## Verification

Run:

```bash
npm run test:candidate-diagnostics
npm run test:store-map-early-exit
npm run test:store-map-agent
npm run test:product-engine-v2
```
