import {
  buildStripeCurrencyOptionsForLookup,
  DIRECT_CREDIT_PACK_PRICES,
  DIRECT_PLAN_MONTHLY_PRICES,
} from "../lib/billingPriceCatalog.js";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const ALLOW_LIVE = args.has("--allow-live");
const API_VERSION = process.env.STRIPE_API_VERSION || "2026-03-04.preview";
const SECRET = String(process.env.STRIPE_SECRET_KEY || "").trim();

const LOOKUPS = [
  "spreelo_starter_monthly",
  "spreelo_starter_yearly",
  "spreelo_growth_monthly",
  "spreelo_growth_yearly",
  "spreelo_pro_monthly",
  "spreelo_pro_yearly",
  "spreelo_credits_100",
  "spreelo_credits_250",
  "spreelo_credits_500",
];

function isLiveKey(value) {
  return /^sk_live_/i.test(value);
}

async function stripe(path, { method = "GET", params = null } = {}) {
  if (!SECRET) throw new Error("STRIPE_SECRET_KEY is missing. Set it in your shell/environment; never paste it into source code.");
  const url = new URL(`https://api.stripe.com${path}`);
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Stripe-Version": API_VERSION,
    },
  };
  if (method === "GET" && params) {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
      else if (value !== undefined && value !== null && value !== "") url.searchParams.append(key, String(value));
    }
  } else if (params) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") body.append(key, String(value));
    }
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = body.toString();
  }
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Stripe request failed (${response.status}).`);
  return payload;
}

async function findPrice(lookupKey) {
  const list = await stripe("/v1/prices", {
    params: { "lookup_keys[]": lookupKey, active: true, limit: 10 },
  });
  return (list?.data || []).find((item) => item?.lookup_key === lookupKey) || null;
}

function buildUpdateParams(lookupKey) {
  const options = buildStripeCurrencyOptionsForLookup(lookupKey);
  const params = {};
  for (const [currency, unitAmount] of Object.entries(options)) {
    params[`currency_options[${currency}][unit_amount]`] = unitAmount;
  }
  return params;
}

async function main() {
  console.log(`Spreelo local pricing ${APPLY ? "SYNC" : "PREVIEW"}`);
  console.log(`Fixed direct currencies: ${Object.keys(DIRECT_PLAN_MONTHLY_PRICES).join(", ")}`);
  console.log(`Credit-pack currencies: ${Object.keys(DIRECT_CREDIT_PACK_PRICES).join(", ")}`);
  console.log("USD plans are fixed at $29 / $59 / $99; EUR at €27 / €53 / €89.");

  if (!APPLY) {
    for (const lookup of LOOKUPS) {
      const options = buildStripeCurrencyOptionsForLookup(lookup);
      console.log(`${lookup}: ${Object.keys(options).length} local currency options`);
    }
    console.log("\nDry run only. Set STRIPE_SECRET_KEY and add --apply to update Stripe.");
    return;
  }

  if (!SECRET) throw new Error("STRIPE_SECRET_KEY is required with --apply.");
  if (isLiveKey(SECRET) && !ALLOW_LIVE) {
    throw new Error("Live Stripe key detected. Re-run with --apply --allow-live only after sandbox verification.");
  }

  for (const lookup of LOOKUPS) {
    const price = await findPrice(lookup);
    if (!price?.id) throw new Error(`Could not find active Stripe price for ${lookup}.`);
    if (String(price.currency || "").toLowerCase() !== "sek") {
      throw new Error(`${lookup} has default currency ${price.currency}, expected SEK. Nothing was changed for this price.`);
    }
    const params = buildUpdateParams(lookup);
    let applied = 0;
    const skipped = [];
    for (const [paramKey, unitAmount] of Object.entries(params)) {
      try {
        await stripe(`/v1/prices/${encodeURIComponent(price.id)}`, {
          method: "POST",
          params: { [paramKey]: unitAmount },
        });
        applied += 1;
      } catch (error) {
        const currency = paramKey.match(/currency_options\[([^\]]+)\]/)?.[1] || paramKey;
        skipped.push(`${currency}: ${error?.message || error}`);
      }
    }
    console.log(`✓ ${lookup} (${price.id}) — ${applied} local currencies applied${skipped.length ? `, ${skipped.length} skipped` : ""}`);
    skipped.forEach((item) => console.warn(`  ! ${item}`));
  }

  console.log("\nDone. Verify Starter/Growth/Pro and Extra Credits in Stripe before using the same sync on live.");
}

main().catch((error) => {
  console.error(`ERROR: ${error?.message || error}`);
  process.exitCode = 1;
});
