import "./globals.css";

export const metadata = {
  title: "Spreelo App",
  description: "AI social media assistant for small businesses",
};

export default function RootLayout({ children }) {
  const shopifyClientId = String(process.env.SHOPIFY_CLIENT_ID || "").trim();

  return (
    <html lang="en">
      <head>
        {shopifyClientId ? (
          <>
            <meta name="shopify-api-key" content={shopifyClientId} />
            {/*
              Spreelo already authenticates its normal API calls with Supabase.
              Keep App Bridge's automatic fetch/redirect interception disabled so
              embedded Shopify support cannot replace those Authorization headers.
              /shopify/app requests a fresh Shopify ID token explicitly instead.
            */}
            <meta name="shopify-disabled-features" content="fetch, auto-redirect" />
            <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
          </>
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
