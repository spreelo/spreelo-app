# Codex OpenAI 5.6 update

This version centralizes all OpenAI model selection in `lib/openaiModels.js`.

Default routing:

- GPT-5.6 Sol: campaign planning and advanced product research.
- GPT-5.6 Terra: manual post generation and main brand analysis.
- GPT-5.6 Luna: automated post text and fast product research.
- GPT-4.1 Mini: UI translation, language detection, JSON repair, and other helpers.
- GPT Image 2: image generation.

Every model can be overridden with deployment environment variables documented
in `README.md`. Existing `OPENAI_API_KEY` configuration is unchanged.
