---
name: getyourguide-mcp
description: This skill should be used when the user asks about GetYourGuide tours, activities, or attraction tickets. Triggers on phrases like "find tours on GetYourGuide", "things to do in Paris", "skip-the-line tickets", "GetYourGuide reviews", "book an activity", or any request involving searching tours, activities, day trips, or attraction tickets.
---

# getyourguide-mcp

MCP server for GetYourGuide — read-only search and discovery of tours,
activities, and attraction tickets via the GetYourGuide Partner API.

- **npm:** [npmjs.com/package/getyourguide-mcp](https://www.npmjs.com/package/getyourguide-mcp)
- **Source:** [github.com/chrischall/getyourguide-mcp](https://github.com/chrischall/getyourguide-mcp)

## Setup

Add to `.mcp.json` in your project or `~/.claude/mcp.json`:

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

Get an API key by joining the free partner program at
[partner.getyourguide.com](https://partner.getyourguide.com). Optional env:
`GYG_CURRENCY` (e.g. `USD`), `GYG_LANGUAGE` (e.g. `en`).

## Tools

| Tool | Use it to |
| --- | --- |
| `gyg_search_tours` | Find tours by free text / location / category / date range. Start here. Prefer `compact: true` when browsing — full records are verbose. |
| `gyg_get_tour` | Pull the full record once a tour is chosen |
| `gyg_get_tour_options` | See bookable options (ticket types, times) for a tour, optionally within dates |
| `gyg_get_tour_reviews` | Read customer reviews for a tour |
| `gyg_list_categories` | Discover category IDs to filter searches |
| `gyg_list_category_tours` | Browse tours in one category |
| `gyg_get_location` | Resolve a location ID (city / POI / region) |
| `gyg_list_location_tours` | Browse everything bookable at a location |

## Usage notes

- Everything is **read-only** — booking still happens on getyourguide.com
  (tour records include the `url`).
- Results honor `currency` / `language` args (fall back to the env defaults).
- If a response looks structurally off, the server has already logged a
  precise drift warning to stderr and returned the raw body — report the
  warning text upstream rather than working around it silently. Search tools
  accept `extraParams` for raw query params if the API needs something the
  schema doesn't expose.
- A `401`/`403` error means the key is wrong **or** its partner tier doesn't
  cover that endpoint — check the partner dashboard before assuming the key
  is dead.
