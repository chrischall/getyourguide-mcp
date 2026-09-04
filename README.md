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
| `gyg_search_tours` | Search tours/activities by free text, location, category, or date range; sortable; `view` |
| `gyg_get_tour` | Full record for one tour by numeric ID; `view` |
| `gyg_get_tour_options` | Bookable options of a tour (ticket types, times), optionally within a date range |
| `gyg_get_tour_availability` | Booking availability of a tour: participant categories, addons, available dates |
| `gyg_get_tour_reviews` | Customer reviews for a tour |
| `gyg_list_categories` | Activity categories (IDs feed `gyg_search_tours` / `gyg_list_category_tours`) |
| `gyg_list_category_tours` | Tours in one category; `view` |
| `gyg_get_location` | Details for a location (city, POI, region) by ID |
| `gyg_list_location_tours` | Tours available at one location; `view` |
| `gyg_healthcheck` | Verify credentials and upstream reachability; reports failures as data, not exceptions |

### `view` — response shape

The tools marked `view` above take `view: "compact" | "full"`, and **`compact` is
the default**. An efficiency that has to be asked for is one that usually is not,
so it is not opt-in — the old `compact: true` flag on `gyg_search_tours` is gone.

- **`compact`** — on the three tour LISTINGS it returns the documented slim
  projection (`tour_id`, `title`, `abstract`, `url`, `price`, `overall_rating`,
  `number_of_ratings`, `durations`, `categories`, `locations`), flattened to
  `{ _metadata, tours }`. On `gyg_get_tour` — one record, no listing envelope to
  project — it instead strips image URLs and keeps everything else.
- **`full`** — GetYourGuide's whole validated record, untouched.

Reach for `full` when you need a field the projection does not carry (picture
variants, coordinates, marketing copy). Every response is minified JSON either
way: formatting whitespace is dropped, whitespace inside a value is not.

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
npm test               # tsc typecheck + vitest (no network — everything mocked)
npm run test:coverage  # tsc typecheck + the CI gate: 100% lines/branches/functions/statements
```

Releases are automated with release-please; don't hand-bump versions. PR
titles must be conventional commits (`feat:`, `fix:`, …) because the repo
squash-merges.

## License

MIT
