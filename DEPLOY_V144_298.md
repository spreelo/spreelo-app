# Spreelo v144.298 — Pinterest renewal and recovery

Based on the supplied v144.297 Shotstack timeout/logging ZIP. Its Shotstack changes and all other unchanged files are preserved.

## Behavior

The daily Pinterest job now includes expired and needs_reconnect connections. Recovery requires a previously selected board, a stored refresh token, and no known expired refresh-token date. It forces token renewal and validates the Pinterest user account before marking the connection connected again. Explicitly disconnected rows are excluded.

The job logs a safe summary with checked, refreshed, healthy, recovered, skipped, reconnectRequired and transientFailures. It does not log tokens. A successful HTTP 200 job response alone does not imply successful renewal; inspect these counts.

Generic HTTP 400 or 401 errors from the token endpoint no longer automatically require customer reconnect. Confirmed invalid/revoked user grants still require it. Shared invalid client credentials remain operational failures rather than customer authorization failures. HTTP 429/500 remain temporary failures.

Token updates compare the saved status and refresh token so a concurrent change cannot be overwritten. Recovery also compares the selected board. Missing scopes in a successful provider response preserve previously saved permissions. Authorization-code exchange explicitly requests continuous refresh tokens for compatibility with older Pinterest apps.

## Deploy and verify

Deploy the full ZIP. The smaller ZIP contains only changes relative to the supplied v144.297 Shotstack timeout/logging version and can be applied over that version.

No new SQL or environment variables are required. Existing Pinterest credentials and CRON_SECRET must remain configured. The daily schedule remains 03:15 UTC (05:15 Swedish summer time).

Pressit's exported record has expired access credentials but a refresh-token expiry of October 7, 2026. After deployment, the daily job will attempt recovery if those saved details are still current. Success depends on Pinterest accepting the stored refresh token; its future expiry date does not prove it has not been revoked. No token was tested live and no production account was modified during development.

Check the next job's recovered/refreshed/reconnectRequired/transientFailures counts and the saved last_connection_error. If Pinterest confirms that the refresh grant is invalid, customer authorization is still required. Intentionally disconnected connections remain disconnected.

## Validation

Production build passed with dummy credentials. Eight regression scripts passed, including the new v144.298 mocked runtime test, v143.45 Pinterest reliability, and v144.157, .256, .277, .294, .296, .297.

Runtime coverage includes expired/reconnect recovery, token rotation, scope preservation, account validation, disconnected/missing/expired grant exclusion, generic 400/401, invalid app credentials, 429/500, revoked grants, storage failure, manual-disconnect races, stale refresh-token writes, continuous token requests, cron authentication and the daily schedule. No live API requests or emails were sent.
