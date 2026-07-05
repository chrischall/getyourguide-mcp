// Helpers shared by the tool registrars: the JSON tool-result wrapper, the
// zod arg atoms every listing tool repeats (currency / language / pagination),
// and the opt-in compact projection for verbose tour listings.
import { textResult } from '@chrischall/mcp-utils';
import { z } from 'zod';

/**
 * Pretty-printed JSON tool result. Thin wrapper over @chrischall/mcp-utils'
 * `textResult` so the rest of the codebase keeps the local name.
 */
export const jsonResponse = textResult;

/** Per-call currency override (falls back to the GYG_CURRENCY env default). */
export const currencyArg = z
  .string()
  .optional()
  .describe('Currency for prices, ISO 4217 (e.g. USD, EUR). Defaults to GYG_CURRENCY when set.');

/** Per-call content-language override (falls back to GYG_LANGUAGE). */
export const languageArg = z
  .string()
  .optional()
  .describe('Content language (e.g. en, de). Defaults to GYG_LANGUAGE when set.');

/** Offset/limit pagination args shared by every listing tool. */
export const paginationArgs = {
  limit: z.number().int().min(1).max(100).default(20).describe('Maximum number of items to return (1-100).'),
  offset: z.number().int().min(0).default(0).describe('Number of items to skip (0-based).'),
} as const;

/**
 * Escape hatch for API drift: extra query params merged verbatim into the
 * request, so a renamed/undocumented Partner API param is usable without a
 * code change (the response shapes here were not live-verifiable at build
 * time — see docs/GETYOURGUIDE-API.md).
 */
export const extraParamsArg = z
  .record(z.string(), z.string())
  .optional()
  .describe('Extra raw query params to merge into the request verbatim (escape hatch for API drift).');

/**
 * Fields kept by the compact tour projection — documented summary fields
 * only; everything fat (picture size variants, coordinates, marketing blobs)
 * is dropped. Absent fields are simply omitted, so drift cannot inject
 * `undefined`s.
 */
export const COMPACT_TOUR_KEYS = [
  'tour_id',
  'title',
  'abstract',
  'url',
  'price',
  'overall_rating',
  'number_of_ratings',
  'durations',
  'categories',
  'locations',
] as const;

/** Project one raw tour record down to {@link COMPACT_TOUR_KEYS}. */
export function compactTour(tour: unknown): Record<string, unknown> {
  const record = (tour ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of COMPACT_TOUR_KEYS) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  return out;
}

/**
 * Compact a `{ _metadata, data: { tours: [...] } }` listing envelope. When the
 * expected array isn't where we expect it (API drift), warn to stderr and
 * return the RAW response rather than an empty/wrong projection.
 */
export function compactTours(raw: unknown): unknown {
  const tours = (raw as { data?: { tours?: unknown } } | null | undefined)?.data?.tours;
  if (!Array.isArray(tours)) {
    console.error(
      '[getyourguide-mcp] WARNING: expected data.tours array is missing — returning the raw response (compact projection skipped).',
    );
    return raw;
  }
  const meta = (raw as { _metadata?: unknown })._metadata;
  return { _metadata: meta, tours: tours.map(compactTour) };
}

/**
 * Loose envelope for tour-listing responses — validates only the path the
 * compact projection reads; unknown fields pass through untouched.
 */
export const ToursEnvelope = z.looseObject({
  data: z.looseObject({
    tours: z.array(z.unknown()),
  }),
});
