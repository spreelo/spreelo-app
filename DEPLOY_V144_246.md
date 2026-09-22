# Deploy v144.246

1. Deploy the v144.246 application ZIP normally.
2. No SQL is required.
3. Keep the existing Shopify environment variables and `read_products` scope unchanged.
4. Open AI Content Studio on the connected Shopify test brand.
5. If at least one Shopify product is ACTIVE, published to the Online Store, has an available-for-sale variant and has a product image, the product formats should now appear automatically.
6. For the current Test Store 2 test, choose a normal Product Post and let Spreelo choose the product. Then trigger the scheduled run with the existing admin scheduling bypass and verify the Shopify Product Engine log messages.
