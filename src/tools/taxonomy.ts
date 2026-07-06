// Taxonomy tools: the category tree and location records the search tools
// filter by, plus their per-category / per-location tour listings.
//
// The /locations/{id} and /locations/{id}/tours routes are absent from the
// official OpenAPI spec (github.com/getyourguide/partner-api-spec) but
// live-verified to exist (2026-07-06: both answer 401 "X-ACCESS-TOKEN header
// is missing" pre-auth, i.e. the routes are real) — treat them as legacy and
// expect them to be the first to drift.
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
        cnt_language: args.language,
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
      // Live-verified 2026-07-06: /categories/{id}/tours (shipped in 1.0.0)
      // is a 404 — the Partner API filters tours by category via
      // /tours?categories[]={id} instead.
      const raw = await client.get('/tours', {
        'categories[]': args.categoryId,
        currency: args.currency,
        cnt_language: args.language,
        limit: args.limit,
        offset: args.offset,
      });
      const validated = parseGYG(ToursEnvelope, raw, `GET /tours?categories[]=${args.categoryId}`);
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
        cnt_language: args.language,
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
        cnt_language: args.language,
        limit: args.limit,
        offset: args.offset,
      });
      const validated = parseGYG(ToursEnvelope, raw, `GET /locations/${args.locationId}/tours`);
      return jsonResponse(args.compact ? compactTours(validated) : validated);
    },
  );
}
