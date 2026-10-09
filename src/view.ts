import { minifiedResult, resolveView, stripMediaUrls, viewParam, type View } from '@chrischall/mcp-utils';
import { compactTours } from './tools/_shared.js';

/**
 * The rungs this server honours (`@chrischall/mcp-utils`' `view` vocabulary;
 * `chrischall/workflows` `docs/fleet-conventions.md`, "Response shape").
 *
 * This repo is NOT the un-grounded tier. `_shared.ts` has carried
 * `compactTour`/`compactTours` — a documented field projection with its own
 * drift-safe fallback — all along, and it was opt-in: `compact: false`, with
 * `gyg_search_tours`' description asking the caller to "Set compact=true for
 * slim summaries when browsing". An efficiency that has to be requested is one
 * that usually is not.
 *
 * So compact is the default now, and it does BOTH: the existing field
 * projection where the payload has a `data.tours` array, and media stripping
 * everywhere (which the field projection never did).
 *
 * No `raw` rung: `full` already returns the validated upstream payload.
 */
export const GYG_VIEWS = ['compact', 'full'] as const;

/** Note for the three tour LISTINGS, whose compact rung is the field projection. */
const TOURS_NOTE =
  'compact returns the slim tour projection (id, title, price, duration, rating, cancellation) and strips ' +
  'image URLs; "full" returns GetYourGuide\'s whole records.';
/** Note for every other tool, whose compact rung only strips media. */
const MEDIA_NOTE =
  'compact strips image URLs and keeps every other field; "full" returns GetYourGuide\'s whole record, image URLs included.';

/**
 * The `view` parameter every read tool in this server takes. `tours: true`
 * mirrors {@link viewResponse}'s flag: only the listings that get the field
 * projection may describe one — the rest would otherwise promise a slim tour
 * summary and answer a media-stripped payload.
 */
export const viewArg = (opts: { tours?: boolean } = {}): ReturnType<typeof viewParam> =>
  viewParam(GYG_VIEWS, { note: opts.tours === true ? TOURS_NOTE : MEDIA_NOTE });

/**
 * Answer in the requested rung.
 *
 * `tours: true` opts a payload into the field projection as well — the three
 * LISTING tools (`gyg_search_tours`, `gyg_list_category_tours`,
 * `gyg_list_location_tours`), whose `data.tours` array is the shape
 * `compactTours` was written against.
 *
 * Without it compact still strips media, which is the part that needs no
 * knowledge of the shape. Every non-listing tool takes this path:
 * `gyg_get_tour` answers ONE record — no `data.tours` array for the projection
 * to read, and the picture size variants `COMPACT_TOUR_KEYS` calls fat still
 * in it — and options, availability, reviews, categories and location answer
 * shapes with no verified field list but plenty of image/avatar URLs.
 *
 * `compactTours` already returns the payload untouched (with a stderr warning)
 * when `data.tours` is not where it expects, so drift on the projected path
 * degrades rather than empties.
 */
export function viewResponse(
  view: string | undefined,
  data: unknown,
  opts: { tours?: boolean } = {},
): ReturnType<typeof minifiedResult> {
  const rung: View = resolveView(view, GYG_VIEWS);
  if (rung !== 'compact') return minifiedResult(data);
  // A hand-written projection is NOT then media-stripped. `compactTour` was
  // written with knowledge of the API and already drops the picture variants;
  // running a blind subtractive rule over its output would let an un-grounded
  // rule overrule a grounded one, which bit viator-mcp (#72) where the
  // projection deliberately KEEPS a cover image. Media stripping is for the
  // payloads that have no projection to speak for them.
  if (opts.tours === true) return minifiedResult(compactTours(data));
  return minifiedResult(stripMediaUrls(data));
}
