// Tour tools: search, detail, bookable options, and reviews. All read-only
// GETs against the Partner API — this server registers no write tools.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GYGClient } from '../client.js';
import { parseGYG } from '../validate.js';
import {
  compactTours,
  currencyArg,
  dateRangeArgs,
  dateRangeParam,
  extraParamsArg,
  jsonResponse,
  languageArg,
  paginationArgs,
  ToursEnvelope,
} from './_shared.js';

const tourIdArg = z.number().int().positive().describe('Numeric GetYourGuide tour ID (e.g. 23776).');

export function registerTourTools(server: McpServer, client: GYGClient): void {
  server.registerTool(
    'gyg_search_tours',
    {
      description:
        'Search GetYourGuide tours and activities. Filter by free text (or "iata:<code>" for airports), location ID, ' +
        'category ID, and date range; sort by popularity, price, or rating. Set compact=true for slim summaries when browsing.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        q: z.string().optional().describe('Free-text search, e.g. "louvre skip the line" or "iata:jfk".'),
        locationId: z.number().int().positive().optional().describe('Restrict to a location ID (city/POI/region).'),
        categoryId: z.number().int().positive().optional().describe('Restrict to a category ID.'),
        ...dateRangeArgs,
        sortField: z
          .enum(['popularity', 'price', 'rating', 'duration'])
          .optional()
          .describe('Sort field (API default: popularity).'),
        sortDirection: z.enum(['asc', 'desc']).optional().describe('Sort direction (ignored for popularity).'),
        currency: currencyArg,
        language: languageArg,
        compact: z
          .boolean()
          .default(false)
          .describe('Return slim tour summaries instead of full records (recommended for browsing).'),
        ...paginationArgs,
        extraParams: extraParamsArg,
      },
    },
    async (args) => {
      const raw = await client.get('/tours', {
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
        ...args.extraParams,
      });
      const validated = parseGYG(ToursEnvelope, raw, 'GET /tours');
      return jsonResponse(args.compact ? compactTours(validated) : validated);
    },
  );

  server.registerTool(
    'gyg_get_tour',
    {
      description: 'Get the full GetYourGuide record for one tour/activity by its numeric ID.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        tourId: tourIdArg,
        currency: currencyArg,
        language: languageArg,
      },
    },
    async (args) => {
      const raw = await client.get(`/tours/${args.tourId}`, {
        currency: args.currency,
        cnt_language: args.language,
      });
      return jsonResponse(raw);
    },
  );

  server.registerTool(
    'gyg_get_tour_options',
    {
      description:
        'List the bookable options of a tour (ticket types, times, languages offered), optionally within a date range.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        tourId: tourIdArg,
        ...dateRangeArgs,
        currency: currencyArg,
        language: languageArg,
        limit: paginationArgs.limit,
        extraParams: extraParamsArg,
      },
    },
    async (args) => {
      const raw = await client.get(`/tours/${args.tourId}/options`, {
        'date[]': dateRangeParam(args.dateFrom, args.dateTo),
        currency: args.currency,
        cnt_language: args.language,
        limit: args.limit,
        ...args.extraParams,
      });
      return jsonResponse(raw);
    },
  );

  server.registerTool(
    'gyg_get_tour_reviews',
    {
      description: 'List customer reviews for a tour (rating outline plus individual review items).',
      annotations: { readOnlyHint: true },
      inputSchema: {
        tourId: tourIdArg,
        currency: currencyArg,
        language: languageArg,
        sortField: z.enum(['rating', 'date']).optional().describe('Sort field for reviews.'),
        sortDirection: z.enum(['asc', 'desc']).optional().describe('Sort direction.'),
        limit: paginationArgs.limit,
        offset: z
          .number()
          .int()
          .min(0)
          .max(300)
          .default(0)
          .describe('Number of reviews to skip (0-based; the API caps review offsets at 300).'),
      },
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
      return jsonResponse(raw);
    },
  );
}
