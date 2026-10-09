import type { McpServer } from '@modelcontextprotocol/server';

// Tour tools: search, detail, bookable options, and reviews. All read-only
// GETs against the Partner API — this server registers no write tools.
import { viewArg, viewResponse } from '../view.js';
import { z } from 'zod';
import { resolveLanguage, type GYGClient } from '../client.js';
import { parseGYG } from '../validate.js';
import {
  currencyArg,
  dateRangeArgs,
  dateRangeParam,
  extraParamsArg,
  languageArg,
  paginationArgs,
  READ_ANNOTATIONS,
  ToursEnvelope,
} from './_shared.js';

const tourIdArg = z
  .number()
  .int()
  .positive()
  .describe('Numeric GetYourGuide tour ID (e.g. 23776).');

export function registerTourTools(server: McpServer, client: GYGClient): void {
  server.registerTool(
    'gyg_search_tours',
    {
      description:
        'Search GetYourGuide tours and activities. Filter by free text (or "iata:<code>" for airports), location ID, ' +
        'category ID, and date range; sort by popularity, price, or rating. Returns slim summaries by default; pass view:"full" for the whole records.',
      annotations: READ_ANNOTATIONS,
      inputSchema: z.object({
        q: z
          .string()
          .optional()
          .describe('Free-text search, e.g. "louvre skip the line" or "iata:jfk".'),
        locationId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Restrict to a location ID (city/POI/region).'),
        categoryId: z.number().int().positive().optional().describe('Restrict to a category ID.'),
        ...dateRangeArgs,
        sortField: z
          .enum(['popularity', 'price', 'rating', 'duration'])
          .optional()
          .describe('Sort field (API default: popularity).'),
        sortDirection: z
          .enum(['asc', 'desc'])
          .optional()
          .describe('Sort direction (ignored for popularity).'),
        currency: currencyArg,
        language: languageArg,
        view: viewArg(),
        ...paginationArgs,
        extraParams: extraParamsArg,
      }),
    },
    async (args) => {
      // extraParams spreads FIRST so the typed, zod-bounded args win on any
      // colliding key (a typed arg left undefined still clears the collision,
      // and the client then injects its currency/cnt_language defaults).
      const raw = await client.get('/tours', {
        ...args.extraParams,
        q: args.q,
        location: args.locationId,
        'categories[]': args.categoryId,
        'date[]': dateRangeParam(args.dateFrom, args.dateTo),
        sortfield: args.sortField,
        sortdirection: args.sortDirection,
        currency: args.currency,
        cnt_language: args.language,
        limit: args.limit,
        offset: args.offset,
      });
      const validated = parseGYG(ToursEnvelope, raw, 'GET /tours');
      return viewResponse(args.view, validated, { tours: true });
    },
  );

  server.registerTool(
    'gyg_get_tour',
    {
      description:
        'Get the full GetYourGuide record for one tour/activity by its numeric ID. Image URLs are stripped by ' +
        'default; pass view:"full" to keep them.',
      annotations: READ_ANNOTATIONS,
      inputSchema: z.object({
        tourId: tourIdArg,
        currency: currencyArg,
        language: languageArg,
        view: viewArg(),
      }),
    },
    async (args) => {
      const raw = await client.get(`/tours/${args.tourId}`, {
        currency: args.currency,
        cnt_language: args.language,
      });
      // The one place the MEDIA-STRIP rung earns its keep here, and the reason
      // it is not dead code. `COMPACT_TOUR_KEYS`' docblock names "picture size
      // variants" as the fat this repo's grounded projection drops — but that
      // projection only ever runs on a `data.tours` LISTING envelope, and this
      // endpoint answers ONE record carrying exactly those variants. There is no
      // verified field list for the single-tour shape, so no `tours: true`: the
      // subtractive rule is the honest ceiling, and it cannot lose a field
      // nobody knew about.
      return viewResponse(args.view, raw);
    },
  );

  server.registerTool(
    'gyg_get_tour_options',
    {
      description:
        'List the bookable options of a tour (ticket types, times, languages offered), optionally within a date range.',
      annotations: READ_ANNOTATIONS,
      inputSchema: z.object({
        tourId: tourIdArg,
        ...dateRangeArgs,
        currency: currencyArg,
        language: languageArg,
        limit: paginationArgs.limit,
        view: viewArg(),
        extraParams: extraParamsArg,
      }),
    },
    async (args) => {
      const raw = await client.get(`/tours/${args.tourId}/options`, {
        ...args.extraParams,
        'date[]': dateRangeParam(args.dateFrom, args.dateTo),
        currency: args.currency,
        cnt_language: args.language,
        limit: args.limit,
      });
      return viewResponse(args.view, raw);
    },
  );

  server.registerTool(
    'gyg_get_tour_availability',
    {
      description:
        'Get booking availability for a tour: bookable participant categories, addons, and the list of available ' +
        'dates (with participant ranges). Lighter than gyg_get_tour_options when you only need "when can I go".',
      annotations: READ_ANNOTATIONS,
      inputSchema: z.object({
        tourId: tourIdArg,
        language: languageArg,
        view: viewArg(),
      }),
    },
    async (args) => {
      // This endpoint is on the newer grammar (live-verified 2026-07-06): it
      // takes `cnt-language` (hyphen, unlike every classic endpoint's
      // cnt_language) and no currency, and answers a bare availability object
      // with no {_metadata, data} envelope — so defaults are skipped and the
      // language is resolved here.
      const raw = await client.get(
        `/tours/${args.tourId}/availability`,
        // `||`, not `??`: an empty-string language means "unset" here too.
        { 'cnt-language': args.language || resolveLanguage() },
        { defaults: false },
      );
      return viewResponse(args.view, raw);
    },
  );

  server.registerTool(
    'gyg_get_tour_reviews',
    {
      description:
        'List customer reviews for a tour (rating outline plus individual review items).',
      annotations: READ_ANNOTATIONS,
      inputSchema: z.object({
        tourId: tourIdArg,
        currency: currencyArg,
        language: languageArg,
        sortField: z.enum(['rating', 'date']).optional().describe('Sort field for reviews.'),
        sortDirection: z.enum(['asc', 'desc']).optional().describe('Sort direction.'),
        view: viewArg(),
        limit: paginationArgs.limit,
        offset: z
          .number()
          .int()
          .min(0)
          .max(300)
          .default(0)
          .describe('Number of reviews to skip (0-based; the API caps review offsets at 300).'),
      }),
    },
    async (args) => {
      // Live-verified 2026-07-06: reviews live at /reviews/tour/{id} (the
      // /tours/{id}/reviews path this server shipped with in 1.0.0 is a 404),
      // and the endpoint requires currency like every other classic endpoint.
      const raw = await client.get(`/reviews/tour/${args.tourId}`, {
        currency: args.currency,
        cnt_language: args.language,
        sortfield: args.sortField,
        sortdirection: args.sortDirection,
        limit: args.limit,
        offset: args.offset,
      });
      return viewResponse(args.view, raw);
    },
  );
}
