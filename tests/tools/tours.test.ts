import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GYGClient } from '../../src/client.js';
import { registerTourTools } from '../../src/tools/tours.js';

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
  registerTourTools(server, client);
}

afterEach(() => vi.restoreAllMocks());

const envelope = {
  _metadata: { totalCount: 1 },
  data: { tours: [{ tour_id: 23776, title: 'Louvre', pictures: [{ url: 'fat.jpg' }] }] },
};

describe('gyg_search_tours', () => {
  it('maps args onto Partner API query params, including extraParams', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_search_tours')!({
      q: 'louvre',
      locationId: 57,
      categoryId: 2,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-05',
      sortField: 'price',
      sortDirection: 'asc',
      currency: 'EUR',
      language: 'en',
      limit: 10,
      offset: 5,
      extraParams: { preformatted: 'full' },
    });
    expect(client.get).toHaveBeenCalledWith('/tours', {
      q: 'louvre',
      location: 57,
      categories: 2,
      date_from: '2026-08-01',
      date_to: '2026-08-05',
      sortfield: 'price',
      sortdirection: 'asc',
      currency: 'EUR',
      'cnt-language': 'en',
      limit: 10,
      offset: 5,
      preformatted: 'full',
    });
    expect(JSON.parse(result.content[0].text)).toEqual(envelope);
  });

  it('returns compact summaries when compact=true', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_search_tours')!({ compact: true });
    expect(JSON.parse(result.content[0].text)).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 23776, title: 'Louvre' }],
    });
  });

  it('degrades to the raw response on envelope drift', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const drifted = { activities: [] };
    const client = makeClient(drifted);
    setup(client);
    const result = await handlers.get('gyg_search_tours')!({ compact: true });
    expect(JSON.parse(result.content[0].text)).toEqual(drifted);
    expect(warn).toHaveBeenCalled();
  });
});

describe('gyg_get_tour', () => {
  it('GETs /tours/{id} with currency/language overrides', async () => {
    const client = makeClient({ data: { tours: [{ tour_id: 23776 }] } });
    setup(client);
    const result = await handlers.get('gyg_get_tour')!({ tourId: 23776, currency: 'USD', language: 'de' });
    expect(client.get).toHaveBeenCalledWith('/tours/23776', { currency: 'USD', 'cnt-language': 'de' });
    expect(result.content[0].type).toBe('text');
  });
});

describe('gyg_get_tour_options', () => {
  it('GETs /tours/{id}/options with a date range and extraParams', async () => {
    const client = makeClient({ data: { tour_options: [] } });
    setup(client);
    await handlers.get('gyg_get_tour_options')!({
      tourId: 1,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
      extraParams: { foo: 'bar' },
    });
    expect(client.get).toHaveBeenCalledWith('/tours/1/options', {
      date_from: '2026-08-01',
      date_to: '2026-08-02',
      currency: undefined,
      'cnt-language': undefined,
      foo: 'bar',
    });
  });
});

describe('gyg_get_tour_reviews', () => {
  it('GETs /tours/{id}/reviews with pagination', async () => {
    const client = makeClient({ data: { reviews: [] } });
    setup(client);
    await handlers.get('gyg_get_tour_reviews')!({ tourId: 2, limit: 5, offset: 10, language: 'en' });
    expect(client.get).toHaveBeenCalledWith('/tours/2/reviews', {
      'cnt-language': 'en',
      limit: 5,
      offset: 10,
    });
  });
});

describe('registration', () => {
  it('registers exactly the four tour tools', () => {
    setup(makeClient({}));
    expect([...handlers.keys()].sort()).toEqual([
      'gyg_get_tour',
      'gyg_get_tour_options',
      'gyg_get_tour_reviews',
      'gyg_search_tours',
    ]);
  });
});
