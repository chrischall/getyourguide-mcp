# getyourguide-mcp

MCP server for GetYourGuide tours & activities, built on the
[GetYourGuide Partner API](https://partner.getyourguide.com)
(`https://api.getyourguide.com/1`, auth header `X-ACCESS-TOKEN`). A
**bearer/direct-API archetype** fleet repo on `@chrischall/mcp-utils` — see
`~/git/mcp-utils/skills/mcp-fleet-builder/SKILL.md` for the shared
conventions; this file covers only what's specific here.

## Commands

```bash
npm install
npm run build          # tsc + esbuild bundle → dist/ (bin: dist/index.js, mcpb: dist/bundle.js)
npm test               # vitest run
npm run test:coverage  # the CI gate — 100% lines/branches/functions/statements on src/ (index.ts excluded)
npx vitest run tests/client.test.ts   # single file
```

## Architecture

```
src/
  index.ts          # bootstrap — runMcp({ name, version, deps: client, tools })
  version.ts        # single VERSION source (x-release-please-version marker)
  client.ts         # GYGClient — thin custom GET client (X-ACCESS-TOKEN ≠ Authorization: Bearer,
                    #   so NOT createApiClient); deferred GYG_API_KEY config error; one 429/503
                    #   retry honoring Retry-After (capped); formatApiError on non-2xx
  validate.ts       # parseGYG — lenient zod validation: warn to stderr + return RAW on mismatch
  tools/_shared.ts  # jsonResponse, currency/language/pagination atoms, compact tour projection
  tools/tours.ts    # gyg_search_tours / gyg_get_tour / gyg_get_tour_options / gyg_get_tour_reviews
  tools/taxonomy.ts # gyg_list_categories / gyg_list_category_tours / gyg_get_location / gyg_list_location_tours
tests/              # vitest; NO network — client tests inject fetchFn/sleepFn, tool tests spy client.get
```

All 8 tools are **read-only GETs** — no write tools, so no `confirm` gates.
Env: `GYG_API_KEY` (required at call time, deferred at boot), `GYG_CURRENCY` /
`GYG_LANGUAGE` (defaults, per-call args override), `GYG_BASE_URL`,
`GYG_REQUEST_TIMEOUT_MS`.

## The one thing to know before changing anything

**The Partner API response shapes are NOT live-verified.** The build
environment's network policy denied egress to `*.getyourguide.com`, so
`docs/GETYOURGUIDE-API.md` records the intended surface and its verification
status. That's why:

- `parseGYG` is lenient-only (warn + return raw, never throw on shape drift);
- `compactTours` falls back to the raw response when `data.tours` is missing;
- search/options tools expose an `extraParams` escape hatch;
- `GYG_BASE_URL` is overridable.

First session with a real `GYG_API_KEY`: capture each endpoint live, pin the
real shapes in `docs/GETYOURGUIDE-API.md`, fix any wrong param/field names,
and only then consider tightening validation. Keep the lenient fallback —
undocumented-to-us APIs drift; degrade, never break.

## Conventions (fleet-standard, abbreviated)

- ESM + NodeNext: relative imports end in `.js`; `rootDir: src`.
- Errors: `McpToolError` with an actionable `hint`; upstream bodies through
  `formatApiError` (redact THEN truncate) — never echo the key.
- 100% coverage is enforced by `npm run test:coverage` (CI runs it). New
  branches need tests; genuinely-unreachable guards get `/* v8 ignore */`.
- Versioning: release-please owns every version field (`src/version.ts` +
  manifests via `extra-files`); `tests/version-sync.test.ts` guards drift.
  PR titles are conventional commits (squash-merge).
- PRs merge via the `chrischall/workflows` pipeline (auto-review → 
  `ready-to-merge` → auto-merge). Don't `gh pr merge`, don't self-arm.
