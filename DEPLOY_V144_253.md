# Deploy Spreelo v144.253

1. Deploy the ZIP normally.
2. No SQL is required.
3. Re-run the two-post Shopify automation test.
4. Confirm the log contains `shopify_admin_api_primary` and, when recent-history is exhausted, may contain `shopify_admin_api_rotation_reuse`.
5. The test should not enter Store Map/public storefront discovery merely because the development store is password protected when Shopify Admin API already supplied suitable verified products.
6. Test a plan with insufficient credits: the activation button should be clickable and show the explicit credit limitation.
7. Test an account at its active-plan limit: activation should return the existing PlanLimitModal explaining the recurring-plan limit and upgrade option.
