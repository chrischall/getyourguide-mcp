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
  it('GETs /tours filtered by categories[] and passes the full envelope through on view:"full"', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_category_tours')!({ view: 'full', categoryId: 9, currency: 'EUR', limit: 2, offset: 0 });
    expect(client.get).toHaveBeenCalledWith('/tours', {
      'categories[]': 9,
      currency: 'EUR',
      cnt_language: undefined,
      limit: 2,
      offset: 0,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(envelope);
  });

  it('compacts tours on an explicit view:"compact"', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_category_tours')!({ categoryId: 9, view: 'compact' });
    expect(JSON.parse(result.content[0].text)).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 1, title: 'Walking tour' }],
    });
  });

  // The rollout's claim, at this tool's boundary: the caller passes NO view and
  // still gets the projection. The `view: 'compact'` case above would keep
  // passing if the default silently flipped back to `full`.
  it('projects by default when no view argument is passed', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_category_tours')!({ categoryId: 9 });
    const text = result.content[0].text;
    expect(JSON.parse(text)).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 1, title: 'Walking tour' }],
    });
    // …and minified: jsonResponse pretty-prints, viewResponse does not, and no
    // content assertion can tell the two apart.
    expect(text).not.toMatch(/\n/);
  });

  // `view` is ours; GetYourGuide has never heard of it. The query params must be
  // identical whether or not a caller named a rung.
  it('never sends view upstream as a query param', async () => {
    const client = makeClient(envelope);
    setup(client);
    await handlers.get('gyg_list_category_tours')!({ categoryId: 9, view: 'full' });
    expect(client.get).toHaveBeenCalledWith('/tours', {
      'categories[]': 9,
      currency: undefined,
      cnt_language: undefined,
      limit: undefined,
      offset: undefined,
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
  it('GETs /locations/{id}/tours and passes through on view:"full"', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_location_tours')!({ view: 'full', locationId: 57, limit: 1, offset: 0 });
    expect(client.get).toHaveBeenCalledWith('/locations/57/tours', {
      currency: undefined,
      cnt_language: undefined,
      limit: 1,
      offset: 0,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(envelope);
  });

  it('compacts tours on an explicit view:"compact"', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_location_tours')!({ locationId: 57, view: 'compact' });
    expect(JSON.parse(result.content[0].text)).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 1, title: 'Walking tour' }],
    });
  });

  // Same default-rung claim on the third listing tool. Each of the three wires
  // `viewResponse` separately, so one of them reverting is a live possibility
  // that no shared test would catch.
  it('projects by default when no view argument is passed', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_list_location_tours')!({ locationId: 57 });
    const text = result.content[0].text;
    expect(JSON.parse(text)).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 1, title: 'Walking tour' }],
    });
    expect(text).not.toMatch(/\n/);
  });

  it('never sends view upstream as a query param', async () => {
    const client = makeClient(envelope);
    setup(client);
    await handlers.get('gyg_list_location_tours')!({ locationId: 57, view: 'full' });
    expect(client.get).toHaveBeenCalledWith('/locations/57/tours', {
      currency: undefined,
      cnt_language: undefined,
      limit: undefined,
      offset: undefined,
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
