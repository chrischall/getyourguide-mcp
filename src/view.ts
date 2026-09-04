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

const NOTE =
  'compact returns the slim tour projection (id, title, price, duration, rating, cancellation) and strips ' +
  'image URLs; "full" returns GetYourGuide\'s whole records.';

/** The `view` parameter every read tool in this server takes. */
export const viewArg = (): ReturnType<typeof viewParam> => viewParam(GYG_VIEWS, { note: NOTE });

/**
 * Answer in the requested rung.
 *
 * `tours: true` opts a payload into the field projection as well. Without it
 * compact still strips media, which is the part that needs no knowledge of the
 * shape — `compactTours` already returns the payload untouched (with a stderr
 * warning) when `data.tours` is not where it expects.
 */
export function viewResponse(
  view: string | undefined,
  data: unknown,
  opts: { tours?: boolean } = {},
): ReturnType<typeof minifiedResult> {
  const rung: View = resolveView(view, GYG_VIEWS);
  if (rung !== 'compact') return minifiedResult(data);
  return minifiedResult(stripMediaUrls(opts.tours === true ? compactTours(data) : data));
}
