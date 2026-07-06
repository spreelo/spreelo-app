# Spreelo campaign time windows patch

This patch changes campaign planning so regular customers do not see or edit exact publishing times.

## What changed

- Campaign posts still store exact `publish_time` internally so cron can run normally.
- Regular customers see broad publishing windows instead of exact times:
  - Morning
  - Late morning
  - Afternoon
  - Evening
- Spreelo now assigns exact internal times from queues inside each window, e.g. if two campaign posts land on the same date and same window they receive different internal times.
- The internal queue prevents campaign posts from being scheduled at exactly the same time.
- `johan@foldern.com` remains an internal tester and can still edit exact times.

## Why

The customer experience should feel guided and professional: Spreelo creates the campaign plan, while customers review the plan without needing to micromanage exact clock times.
