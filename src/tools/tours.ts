// Tour tools: search, detail, bookable options, and reviews. All read-only
// GETs against the Partner API — this server registers no write tools.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GYGClient } from '../client.js';
import { parseGYG } from '../validate.js';
import {
  compactTours,
  currencyArg,
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
        'Search GetYourGuide tours and activities. Filter by free text, location ID, category ID, and date range; ' +
        'sort by popularity, price, or rating. Set compact=true for slim summaries when browsing.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        q: z.string().optional().describe('Free-text search, e.g. "louvre skip the line".'),
        locationId: z.number().int().positive().optional().describe('Restrict to a location ID (city/POI/region).'),
        categoryId: z.number().int().positive().optional().describe('Restrict to a category ID.'),
        dateFrom: z.string().optional().describe('Earliest availability date, YYYY-MM-DD.'),
        dateTo: z.string().optional().describe('Latest availability date, YYYY-MM-DD.'),
        sortField: z
          .enum(['popularity', 'price', 'rating', 'duration'])
          .optional()
          .describe('Sort field (API default: popularity).'),
        sortDirection: z.enum(['asc', 'desc']).optional().describe('Sort direction.'),
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
        categories: args.categoryId,
        date_from: args.dateFrom,
        date_to: args.dateTo,
        sortfield: args.sortField,
        sortdirection: args.sortDirection,
        currency: args.currency,
        'cnt-language': args.language,
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
        'cnt-language': args.language,
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
        dateFrom: z.string().optional().describe('Earliest date, YYYY-MM-DD.'),
        dateTo: z.string().optional().describe('Latest date, YYYY-MM-DD.'),
        currency: currencyArg,
        language: languageArg,
        extraParams: extraParamsArg,
      },
    },
    async (args) => {
      const raw = await client.get(`/tours/${args.tourId}/options`, {
        date_from: args.dateFrom,
        date_to: args.dateTo,
        currency: args.currency,
        'cnt-language': args.language,
        ...args.extraParams,
      });
      return jsonResponse(raw);
    },
  );

  server.registerTool(
    'gyg_get_tour_reviews',
    {
      description: 'List customer reviews for a tour.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        tourId: tourIdArg,
        language: languageArg,
        ...paginationArgs,
      },
    },
    async (args) => {
      const raw = await client.get(`/tours/${args.tourId}/reviews`, {
        'cnt-language': args.language,
        limit: args.limit,
        offset: args.offset,
      });
      return jsonResponse(raw);
    },
  );
}
