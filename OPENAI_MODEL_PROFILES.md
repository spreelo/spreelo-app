# OpenAI model profiles

All OpenAI model names and model-sensitive temperature settings are now in:

`lib/openaiSettings.js`

## Switch profile in one line

Change:

```js
export const DEFAULT_OPENAI_PROFILE = "legacyStable";
```

to:

```js
export const DEFAULT_OPENAI_PROFILE = "terraLunaExperimental";
```

The default is `legacyStable`, which exactly matches the older working model split and temperatures.

You can also switch without editing code by adding this Vercel environment variable:

```text
OPENAI_PROFILE=legacyStable
```

or:

```text
OPENAI_PROFILE=terraLunaExperimental
```

Individual `OPENAI_*_MODEL` environment variables still override the selected profile. The two older variables `PRODUCT_RESEARCH_MODEL` and `PRODUCT_RESEARCH_FAST_MODEL` are also supported for compatibility.

A temperature set to `null` is deliberately omitted from the API request. This prevents GPT-5.6 Terra/Luna from receiving unsupported custom temperature values.
