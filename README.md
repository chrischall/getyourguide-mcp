# getyourguide-mcp

MCP server for [GetYourGuide](https://www.getyourguide.com) — search tours and
activities, read tour details, bookable options, and reviews via the
[GetYourGuide Partner API](https://partner.getyourguide.com).

> 🤖 This project was developed and is maintained by AI (Claude Code).
> Use at your own discretion.

- **npm:** [npmjs.com/package/getyourguide-mcp](https://www.npmjs.com/package/getyourguide-mcp)
- **Source:** [github.com/chrischall/getyourguide-mcp](https://github.com/chrischall/getyourguide-mcp)

## Tools

All tools are read-only — this server registers no write tools.

| Tool | What it does |
| --- | --- |
| `gyg_search_tours` | Search tours/activities by free text, location, category, or date range; sortable; `compact` mode for slim summaries |
| `gyg_get_tour` | Full record for one tour by numeric ID |
| `gyg_get_tour_options` | Bookable options of a tour (ticket types, times), optionally within a date range |
| `gyg_get_tour_availability` | Booking availability of a tour: participant categories, addons, available dates |
| `gyg_get_tour_reviews` | Customer reviews for a tour |
| `gyg_list_categories` | Activity categories (IDs feed `gyg_search_tours` / `gyg_list_category_tours`) |
| `gyg_list_category_tours` | Tours in one category |
| `gyg_get_location` | Details for a location (city, POI, region) by ID |
| `gyg_list_location_tours` | Tours available at one location |

## Setup

You need a **GetYourGuide Partner API key** — join the (free) partner program
at [partner.getyourguide.com](https://partner.getyourguide.com) and copy the
API key from your dashboard. The key is sent as the `X-ACCESS-TOKEN` header on
every request.

### Claude Code / any MCP host

```json
{
  "mcpServers": {
    "getyourguide": {
      "command": "npx",
      "args": ["-y", "getyourguide-mcp"],
      "env": {
        "GYG_API_KEY": "your-partner-api-key"
      }
    }
  }
}
```

The server also boots with **no** key set (so hosts can probe `tools/list` at
install time); the first tool call then returns an actionable error telling
you which env var to set.

### Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `GYG_API_KEY` | yes (for tool calls) | Partner API key, sent as `X-ACCESS-TOKEN` |
| `GYG_CURRENCY` | no | Default currency for prices (ISO 4217; falls back to `USD` — the API requires one); per-call `currency` args override |
| `GYG_LANGUAGE` | no | Default content language (falls back to `en` — the API requires one); per-call `language` args override |
| `GYG_BASE_URL` | no | API base URL (default `https://api.getyourguide.com/1`) |
| `GYG_REQUEST_TIMEOUT_MS` | no | Per-request timeout (default 30000) |

For local development, put them in a `.env` next to the server (gitignored;
see `.env.example`).

## Behavior notes

- **Rate limits:** one automatic retry on `429`/`503` honoring `Retry-After`
  (capped at 10s). If it still fails, the error tells you to back off.
- **Auth errors:** a `401`/`403` names both possible causes — a wrong key, or
  a key whose partner tier doesn't cover that endpoint.
- **API drift:** responses are validated leniently. On an unexpected shape the
  server logs a precise warning to stderr and returns the raw response rather
  than breaking; search tools also accept `extraParams` to pass raw query
  params through verbatim. See `docs/GETYOURGUIDE-API.md` — routes and
  request shapes are live-verified against the API and its official OpenAPI
  spec; real 200 bodies still need pinning from a keyed capture.
- **Secrets:** upstream error bodies are redacted then truncated before they
  reach a tool result; the API key is never echoed.

## Development

```bash
npm install
npm run build          # tsc + esbuild bundle → dist/
npm test               # vitest (no network — everything mocked)
npm run test:coverage  # the CI gate: 100% lines/branches/functions/statements
```

Releases are automated with release-please; don't hand-bump versions. PR
titles must be conventional commits (`feat:`, `fix:`, …) because the repo
squash-merges.

## License

MIT
