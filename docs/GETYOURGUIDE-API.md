# GetYourGuide Partner API — endpoint notes

The surface this server codes against, and the verification status of each
shape.

## Verification status: routes & request shapes LIVE-VERIFIED (2026-07-06); success bodies still pending a key

The 1.0.0 build was produced in a sandbox that couldn't reach
`*.getyourguide.com`, so everything was coded from recall. On 2026-07-06 the
surface was re-verified two ways, **without** an API key:

1. **Live probes** — the Partner API validates query params *before* auth, so
   unauthenticated requests reveal which routes exist (real route → JSON 401
   `The X-ACCESS-TOKEN header is missing`; known family, wrong sub-path →
   JSON 404 `errorCode 2`; unknown route → HTML 404) and which param names it
   recognizes (`param=bogus` → `Invalid value bogus for parameter <name>`).
   Each tool's exact request was then replayed through the **built client**
   (`dist/client.js`) with a fake key: every path answered a uniform 401,
   i.e. all params cleared validation.
2. **The official OpenAPI spec** — `https://api.getyourguide.com/doc`
   redirects to Swagger at `code.getyourguide.com/partner-api-spec`, backed
   by github.com/getyourguide/partner-api-spec (Apache-2.0). Request params
   and response schemas below are pinned from that spec.

**Still unverified:** real 200 response bodies (needs a working
`GYG_API_KEY`; none was present on this machine), and which endpoints a
given key's partner tier can reach. `parseGYG` stays lenient (warn + return
raw) and `compactTours` keeps its raw fallback for exactly this reason —
degrade, never break. First session with a real key: capture one 200 per
endpoint and note any drift from the spec'd shapes here.

Probe template (no key → param/route validation; add the header for real data):

```bash
curl -sS -H "X-ACCESS-TOKEN: $GYG_API_KEY" -H "Accept: application/json" \
  "https://api.getyourguide.com/1/tours?q=louvre&limit=2&currency=EUR&cnt_language=en"
```

## Surface choice: Partner API, not the consumer web API

Two candidate surfaces exist (the skill's seller-vs-consumer fork):

1. **Partner API** — `https://api.getyourguide.com/1/`, header
   `X-ACCESS-TOKEN: <key>`. GetYourGuide's *affiliate* surface, explicitly
   built for third parties to power tour discovery; keys come from the free
   partner program signup. This is the surface built here.
2. **Consumer web internal API** (`www.getyourguide.com` /
   `travelers-api.getyourguide.com`) — undocumented, likely bot-walled, would
   need the fetchproxy bridge. Not needed while the Partner API covers reads.

The spec also lists a testing server `https://api.gygtest.net` — verified
Cloudflare-walled from here (challenge page), not usable server-side.

## Endpoints used

Base URL: `https://api.getyourguide.com/1` (override: `GYG_BASE_URL`).
All requests are GETs with `X-ACCESS-TOKEN`, `Accept: application/json`, and a
descriptive `User-Agent`.

**`cnt_language` and `currency` are REQUIRED on every documented endpoint**
(live-verified: omitting either is a 400 before auth). The client always
sends both: per-call arg → `GYG_CURRENCY`/`GYG_LANGUAGE` env → `USD`/`en`.

| Tool | Endpoint | Query params sent | Verified |
| --- | --- | --- | --- |
| `gyg_search_tours` | `GET /tours` | `q` (or `iata:<code>`), `location` (legacy, see below), `categories[]`, `date[]`, `sortfield`, `sortdirection`, `currency`, `cnt_language`, `limit`, `offset` | live + spec (`location`: live only) |
| `gyg_get_tour` | `GET /tours/{tourId}` | `currency`, `cnt_language` | live + spec |
| `gyg_get_tour_options` | `GET /tours/{tourId}/options` | `date[]`, `currency`, `cnt_language`, `limit` | live + spec |
| `gyg_get_tour_availability` | `GET /tours/{tourId}/availability` | `cnt-language` (**hyphen** — newer grammar; no currency) | live + spec |
| `gyg_get_tour_reviews` | `GET /reviews/tour/{tourId}` | `currency`, `cnt_language`, `sortfield` (`rating`\|`date`), `sortdirection`, `limit`, `offset` (≤300) | live + spec |
| `gyg_list_categories` | `GET /categories` | `cnt_language`, `currency`, `limit`, `offset` | live + spec |
| `gyg_list_category_tours` | `GET /tours?categories[]={id}` | `categories[]`, `currency`, `cnt_language`, `limit`, `offset` | live + spec |
| `gyg_get_location` | `GET /locations/{locationId}` | `cnt_language`, `currency` | live only (not in spec — legacy) |
| `gyg_list_location_tours` | `GET /locations/{locationId}/tours` | `currency`, `cnt_language`, `limit`, `offset` | live only (not in spec — legacy) |

### What 1.0.0 got wrong (fixed 2026-07-06)

- `cnt-language` → **`cnt_language`** (hyphen is silently unrecognized; every
  1.0.0 request failed `cnt_language: This value is missing`). Exception: the
  newer `/tours/{id}/availability` endpoint wants **`cnt-language`** (hyphen)
  — sibling endpoints use different grammars.
- `date_from`/`date_to` → **`date[]`** (repeated param; one value = "from",
  two = range; format `YYYY-MM-DDThh:mm:ss`, enforced — bare dates are
  rejected with `errorCode 5`).
- `categories=<id>` → **`categories[]=<id>`** (both are recognized live, but
  the spec documents the array form).
- `GET /tours/{id}/reviews` → **`GET /reviews/tour/{id}`** (old path is a
  JSON 404). Reviews also require `currency`.
- `GET /categories/{id}/tours` → does **not** exist; category tours are
  `GET /tours?categories[]={id}`.
- `currency`/`cnt_language` were optional in 1.0.0 → both are required; the
  client now hard-falls-back to `USD`/`en`.
- `limit` max is **500** (spec; was capped at 100 here), API default 10.

### Verified live but undocumented (use with drift expectations)

- `location` param on `/tours` (`Invalid value … for parameter location` on a
  bogus value → recognized).
- `/locations/{id}` and `/locations/{id}/tours` routes (401-pre-auth →
  exist), absent from the official spec.

### Additional spec'd params not (yet) exposed as args

`coordinates[]` (lat, lng, radius — mutually exclusive with `q`),
`cond_language[]`, `price[]`, `rating[]`, `duration[]` (minutes),
`flags[]` (`private`, `wheelchair`, `skip-line`, `pick-up`, `special`),
`preformatted` (`teaser`|`home`|`full`). All reachable today via
`extraParams` (arrays only as a single value); promote to real args if used.

### Candidate future endpoints (spec'd + live-verified to exist)

- `GET /options/{option_id}`, `GET /suppliers/{supplier_id}`,
  `GET /categories/{category_id}` — same `{_metadata, data:{…}}` envelope
  (`tour_options` / `supplier` / `categories` arrays).
- `POST /tours/{id}/price-breakdown`, plus carts/bookings (write-side,
  booking-tier partners only).
- `/suggest`, `/suggestions`, `/activities` do **not** exist (HTML 404).

## Response envelopes (from the official spec; 200 bodies not yet captured)

Listing/detail envelope (tours, categories, options, suppliers):

```json
{
  "_metadata": {
    "descriptor": "GetYourGuide AG", "date": "…", "status": "OK",
    "query": "…", "availableLanguages": ["en"], "totalCount": 127,
    "limit": 10, "offset": 0
  },
  "data": { "tours": [ { "tour_id": 23776, "title": "…", "price": {}, "…": "…" } ] }
}
```

- `/tours`, `/tours/{id}`: `data.tours[]` (detail is a one-element array)
- `/tours/{id}/options`: `data.tour_options[]`
- `/categories`, `/categories/{id}`: `data.categories[]`
- `/reviews/tour/{id}`: `data.reviews.outline` + `data.reviews.review_items`
- `/tours/{id}/availability`: **bare** availability object (`tour_id`,
  `participants_range`, `categories`, `addons`, `available_dates[]`,
  `update_timestamp`) — no `_metadata`/`data` envelope

Tour fields (spec `Tour` schema) — the compact projection's keys are all
real: `tour_id`, `title`, `abstract`, `url`, `price`, `overall_rating`,
`number_of_ratings`, `durations`, `categories`, `locations`; plus
`tour_code`, `cond_language`, `description`, `highlights`, `inclusions`,
`exclusions`, `pictures`, `coordinates`, `supplier_id`, `opening_hours`,
`cancellation_policy`, `itineraries`, ….

## Error handling contract (error envelope live-captured)

Every API error is JSON:

```json
{
  "descriptor": "GetYourGuide AG", "apiVersion": "1", "method": "/1/tours",
  "status": "ERROR", "query": "…",
  "errors": [ { "errorCode": 0, "errorMessage": "The X-ACCESS-TOKEN header is missing." } ],
  "helpURL": "https://api.getyourguide.com/doc", "date": "…"
}
```

- `400` — param validation (`errorCode` 1/5/15/17…), runs **before** auth.
- `401` — missing/invalid key (`errorCode 0`) → actionable `McpToolError`
  naming BOTH causes (wrong key OR key without access to that endpoint),
  body redacted+truncated via `formatApiError`.
- `404` — JSON `errorCode 2` for a wrong sub-path under a real route family;
  plain HTML for a fully unknown route.
- `429` / `503` → one retry honoring `Retry-After` (capped at 10s, default
  2s); a second failure surfaces a rate-limit error with a back-off hint.
- non-JSON 2xx → actionable error (proxy/interstitial suspected) — never
  `JSON.parse` blind.
