# Spreelo v10.6.1 - stable carousel delivery restored

This is the final packaged version of the v10.6 restoration.

It includes everything in `DEPLOY_V10_6.md` and adds permanent runtime
observability:

- every automation run log records `product_resolver_version`,
- a zero-product terminal error records the stable resolver path,
- the log includes catalog, locked search-pool and campaign candidate counts,
- the log includes the actual match terms and derived search queries,
- the error carries its resolved rule snapshot so the run log does not fall
  back to stale pre-resolution metadata.

No SQL schema migration is required.
