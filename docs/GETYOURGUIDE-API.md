# GetYourGuide Partner API — endpoint notes

The surface this server codes against, and the verification status of each
shape. **Read the caveat first.**

## ⚠️ Verification status: NOT live-verified

The fleet convention is to pin every endpoint's request/response shape from a
real captured call before coding against it. This build was produced in a
sandboxed environment whose network policy **denies egress to
`*.getyourguide.com`** (proxy CONNECT 403), so no endpoint below could be
probed live. Everything here is coded from the publicly documented Partner API
(`partner.getyourguide.com` / `code.getyourguide.com`) as recalled at build
time, and defended accordingly:

- responses are validated **leniently** (`parseGYG`) — on mismatch the tool
  warns to stderr and returns the raw body instead of breaking;
- the compact projection falls back to the raw response when `data.tours`
  isn't where expected;
- search/options tools take an `extraParams` escape hatch so renamed or
  missing query params are usable without a code change;
- the base URL is overridable via `GYG_BASE_URL`.

**First session with a real API key should re-verify each row below** (one
curl per endpoint), pin the actual request/response shapes here, and tighten
anything that turned out wrong. Never commit a captured API key.

```bash
curl -sS -H "X-ACCESS-TOKEN: $GYG_API_KEY" -H "Accept: application/json" \
  "https://api.getyourguide.com/1/tours?q=louvre&limit=2&currency=EUR&cnt-language=en"
```

## Surface choice: Partner API, not the consumer web API

Two candidate surfaces exist (the skill's seller-vs-consumer fork):

1. **Partner API** — `https://api.getyourguide.com/1/`, header
   `X-ACCESS-TOKEN: <key>`. This is GetYourGuide's *affiliate* surface,
   explicitly built for third parties to power tour discovery, and keys come
   from the free partner program signup. Read-only discovery is exactly what
   an MCP needs, so this is the surface built here.
2. **Consumer web internal API** (`www.getyourguide.com` /
   `travelers-api.getyourguide.com`) — undocumented, likely bot-walled, would
   need the fetchproxy bridge. Not needed while the Partner API covers reads;
   revisit only if it doesn't (e.g. for wishlists or a user's bookings, which
   would be a separate cookie/bridge archetype).

## Endpoints used

Base URL: `https://api.getyourguide.com/1` (override: `GYG_BASE_URL`).
All requests are GETs with `X-ACCESS-TOKEN`, `Accept: application/json`, and a
descriptive `User-Agent`.

| Tool | Endpoint | Query params sent |
| --- | --- | --- |
| `gyg_search_tours` | `GET /tours` | `q`, `location`, `categories`, `date_from`, `date_to`, `sortfield`, `sortdirection`, `currency`, `cnt-language`, `limit`, `offset` |
| `gyg_get_tour` | `GET /tours/{tourId}` | `currency`, `cnt-language` |
| `gyg_get_tour_options` | `GET /tours/{tourId}/options` | `date_from`, `date_to`, `currency`, `cnt-language` |
| `gyg_get_tour_reviews` | `GET /tours/{tourId}/reviews` | `cnt-language`, `limit`, `offset` |
| `gyg_list_categories` | `GET /categories` | `cnt-language`, `limit`, `offset` |
| `gyg_list_category_tours` | `GET /categories/{categoryId}/tours` | `currency`, `cnt-language`, `limit`, `offset` |
| `gyg_get_location` | `GET /locations/{locationId}` | `cnt-language` |
| `gyg_list_location_tours` | `GET /locations/{locationId}/tours` | `currency`, `cnt-language`, `limit`, `offset` |

Expected (unverified) listing envelope:

```json
{
  "_metadata": { "totalCount": 123 },
  "data": { "tours": [ { "tour_id": 23776, "title": "…", "price": { … }, … } ] }
}
```

## Error handling contract

- `401` / `403` → actionable `McpToolError` naming BOTH causes (wrong key OR
  key without access to that endpoint / partner tier), body redacted+truncated
  via `formatApiError`.
- `429` / `503` → one retry honoring `Retry-After` (capped at 10s, default
  2s); a second failure surfaces a rate-limit error with a back-off hint.
- non-JSON 2xx → actionable error (proxy/interstitial suspected) — never
  `JSON.parse` blind.
- Everything else → `formatApiError` (redact **then** truncate, per the
  fleet security posture).
