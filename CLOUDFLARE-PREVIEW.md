# Cloudflare migration preview — RB TRADER PRO

This branch is an isolated migration test. It does not change the Vercel production deployment or the `main` branch.

## Files added
- `wrangler.jsonc`: configures the Worker entry point and serves only `./public` as static assets. This avoids treating the repository root (including `node_modules`) as public assets.
- `worker.js`: Cloudflare Worker adapter for market data, health, Yahoo reference quote, AI opinion, and GitHub trade-history read/export.

## Cloudflare setup
1. Connect repository `plaxo69/RB-Gold-Sniper-Trader` to Workers Builds.
2. Select branch `migration-cloudflare-2026-10-11`.
3. Use the Wrangler config at repository root (`wrangler.jsonc`). Do not set the asset output directory to `.`; the assets directory is `./public`.
4. Deploy this branch as the separate Worker named `rb-gold-sniper-trader-preview`. Do not rename it to the production Worker until testing is complete.
5. Add these Worker secrets/variables in Cloudflare:
   - Secret `GITHUB_TOKEN`: a GitHub token with repository contents read/write permission for this repository (needed for history read/export).
   - Secret `OPENAI_API_KEY`: needed for AI opinions.
   - Variable `OPENAI_MODEL`: optional; defaults to `gpt-5.6-luna`.

## Preview limitations — not production-ready yet
- Web Push endpoints (`/api/push-config`, `/api/push-subscribe`, `/api/push-send`) intentionally return a clear unavailable response. iPhone/Safari push notifications are **not migrated yet**.
- Server-side scheduled monitoring is not migrated; `/api/trades/resolve` only confirms that local/client-side resolution is expected.
- This repository change has not been built or tested inside the Cloudflare account. Test the preview URL before relying on it. The app must not be used to make trading decisions until market feed, AI, history and alerts are verified.
- No trading strategy, filters, TP/SL logic, or automatic execution has been changed by this migration work.
