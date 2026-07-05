// Taxonomy tools: the category tree and location records the search tools
// filter by, plus their per-category / per-location tour listings.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GYGClient } from '../client.js';
import { parseGYG } from '../validate.js';
import {
  compactTours,
  currencyArg,
  jsonResponse,
  languageArg,
  paginationArgs,
  ToursEnvelope,
} from './_shared.js';

const compactArg = z
  .boolean()
  .default(false)
  .describe('Return slim tour summaries instead of full records (recommended for browsing).');

export function registerTaxonomyTools(server: McpServer, client: GYGClient): void {
  server.registerTool(
    'gyg_list_categories',
    {
      description: 'List GetYourGuide activity categories (use the IDs to filter tour searches).',
      annotations: { readOnlyHint: true },
      inputSchema: {
        language: languageArg,
        ...paginationArgs,
      },
    },
    async (args) => {
      const raw = await client.get('/categories', {
        'cnt-language': args.language,
        limit: args.limit,
        offset: args.offset,
      });
      return jsonResponse(raw);
    },
  );

  server.registerTool(
    'gyg_list_category_tours',
    {
      description: 'List tours in one GetYourGuide category.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        categoryId: z.number().int().positive().describe('Numeric category ID (from gyg_list_categories).'),
        currency: currencyArg,
        language: languageArg,
        compact: compactArg,
        ...paginationArgs,
      },
    },
    async (args) => {
      const raw = await client.get(`/categories/${args.categoryId}/tours`, {
        currency: args.currency,
        'cnt-language': args.language,
        limit: args.limit,
        offset: args.offset,
      });
      const validated = parseGYG(ToursEnvelope, raw, `GET /categories/${args.categoryId}/tours`);
      return jsonResponse(args.compact ? compactTours(validated) : validated);
    },
  );

  server.registerTool(
    'gyg_get_location',
    {
      description: 'Get details for a GetYourGuide location (city, POI, or region) by its numeric ID.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        locationId: z.number().int().positive().describe('Numeric location ID.'),
        language: languageArg,
      },
    },
    async (args) => {
      const raw = await client.get(`/locations/${args.locationId}`, {
        'cnt-language': args.language,
      });
      return jsonResponse(raw);
    },
  );

  server.registerTool(
    'gyg_list_location_tours',
    {
      description: 'List tours available at one GetYourGuide location (city, POI, or region).',
      annotations: { readOnlyHint: true },
      inputSchema: {
        locationId: z.number().int().positive().describe('Numeric location ID.'),
        currency: currencyArg,
        language: languageArg,
        compact: compactArg,
        ...paginationArgs,
      },
    },
    async (args) => {
      const raw = await client.get(`/locations/${args.locationId}/tours`, {
        currency: args.currency,
        'cnt-language': args.language,
        limit: args.limit,
        offset: args.offset,
      });
      const validated = parseGYG(ToursEnvelope, raw, `GET /locations/${args.locationId}/tours`);
      return jsonResponse(args.compact ? compactTours(validated) : validated);
    },
  );
}
