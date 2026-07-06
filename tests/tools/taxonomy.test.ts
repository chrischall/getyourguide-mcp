import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GYGClient } from '../../src/client.js';
import { registerTaxonomyTools } from '../../src/tools/taxonomy.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

let handlers: Map<string, ToolHandler>;

function makeClient(returnValue: unknown) {
  const client = new GYGClient();
  vi.spyOn(client, 'get').mockResolvedValue(returnValue);
  return client;
}

function setup(client: GYGClient) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  handlers = new Map();
  vi.spyOn(server, 'registerTool').mockImplementation((name: string, _config: unknown, cb: unknown) => {
    handlers.set(name, cb as ToolHandler);
    return undefined as never;
  });
  registerTaxonomyTools(server, client);
}

afterEach(() => vi.restoreAllMocks());

const envelope = {
  _metadata: { totalCount: 1 },
  data: { tours: [{ tour_id: 1, title: 'Walking tour', coordinates: { lat: 0 } }] },
};

describe('gyg_list_categories', () => {
  it('GETs /categories with pagination and language', async () => {
    const client = makeClient({ data: { categories: [] } });
    setup(client);
    const result = await handlers.get('gyg_list_categories')!({ language: 'en', limit: 3, offset: 1 });
    expect(client.get).toHaveBeenCalledWith('/categories', { cnt_language: 'en', limit: 3, offset: 1 });
    expect(JSON.parse(result.content[0].text)).toEqual({ data: { categories: [] } });
  });
});

describe('gyg_list_category_tours', () => {
  it('GETs /tours filtered by categories[] and passes the full envelope through', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_category_tours')!({ categoryId: 9, currency: 'EUR', limit: 2, offset: 0 });
    expect(client.get).toHaveBeenCalledWith('/tours', {
      'categories[]': 9,
      currency: 'EUR',
      cnt_language: undefined,
      limit: 2,
      offset: 0,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(envelope);
  });

  it('compacts tours when compact=true', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_category_tours')!({ categoryId: 9, compact: true });
    expect(JSON.parse(result.content[0].text)).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 1, title: 'Walking tour' }],
    });
  });
});

describe('gyg_get_location', () => {
  it('GETs /locations/{id}', async () => {
    const client = makeClient({ data: { locations: [{ location_id: 57 }] } });
    setup(client);
    await handlers.get('gyg_get_location')!({ locationId: 57, language: 'fr' });
    expect(client.get).toHaveBeenCalledWith('/locations/57', { cnt_language: 'fr' });
  });
});

describe('gyg_list_location_tours', () => {
  it('GETs /locations/{id}/tours and passes through by default', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_location_tours')!({ locationId: 57, limit: 1, offset: 0 });
    expect(client.get).toHaveBeenCalledWith('/locations/57/tours', {
      currency: undefined,
      cnt_language: undefined,
      limit: 1,
      offset: 0,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(envelope);
  });

  it('compacts tours when compact=true', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_location_tours')!({ locationId: 57, compact: true });
    expect(JSON.parse(result.content[0].text)).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 1, title: 'Walking tour' }],
    });
  });
});

describe('registration', () => {
  it('registers exactly the four taxonomy tools', () => {
    setup(makeClient({}));
    expect([...handlers.keys()].sort()).toEqual([
      'gyg_get_location',
      'gyg_list_categories',
      'gyg_list_category_tours',
      'gyg_list_location_tours',
    ]);
  });
});
