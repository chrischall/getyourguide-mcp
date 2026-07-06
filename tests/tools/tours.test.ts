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
      'categories[]': 2,
      'date[]': ['2026-08-01T00:00:00', '2026-08-05T23:59:59'],
      sortfield: 'price',
      sortdirection: 'asc',
      currency: 'EUR',
      cnt_language: 'en',
      limit: 10,
      offset: 5,
      preformatted: 'full',
    });
    expect(JSON.parse(result.content[0].text)).toEqual(envelope);
  });

  it('passes full datetimes through and sends a single-value date[] for dateFrom alone', async () => {
    const client = makeClient(envelope);
    setup(client);
    await handlers.get('gyg_search_tours')!({ dateFrom: '2026-08-01T12:30:00' });
    expect(client.get).toHaveBeenCalledWith('/tours', expect.objectContaining({ 'date[]': ['2026-08-01T12:30:00'] }));
  });

  it('rejects dateTo without dateFrom with an actionable error', async () => {
    const client = makeClient(envelope);
    setup(client);
    await expect(handlers.get('gyg_search_tours')!({ dateTo: '2026-08-05' })).rejects.toMatchObject({
      message: expect.stringContaining('dateTo was given without dateFrom'),
      hint: expect.stringContaining('dateFrom'),
    });
    expect(client.get).not.toHaveBeenCalled();
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
    expect(client.get).toHaveBeenCalledWith('/tours/23776', { currency: 'USD', cnt_language: 'de' });
    expect(result.content[0].type).toBe('text');
  });
});

describe('gyg_get_tour_options', () => {
  it('GETs /tours/{id}/options with a date[] range and extraParams', async () => {
    const client = makeClient({ data: { tour_options: [] } });
    setup(client);
    await handlers.get('gyg_get_tour_options')!({
      tourId: 1,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
      limit: 15,
      extraParams: { foo: 'bar' },
    });
    expect(client.get).toHaveBeenCalledWith('/tours/1/options', {
      'date[]': ['2026-08-01T00:00:00', '2026-08-02T23:59:59'],
      currency: undefined,
      cnt_language: undefined,
      limit: 15,
      foo: 'bar',
    });
  });
});

describe('gyg_get_tour_reviews', () => {
  it('GETs /reviews/tour/{id} with sort and pagination', async () => {
    const client = makeClient({ data: { reviews: {} } });
    setup(client);
    await handlers.get('gyg_get_tour_reviews')!({
      tourId: 2,
      limit: 5,
      offset: 10,
      language: 'en',
      currency: 'EUR',
      sortField: 'date',
      sortDirection: 'desc',
    });
    expect(client.get).toHaveBeenCalledWith('/reviews/tour/2', {
      currency: 'EUR',
      cnt_language: 'en',
      sortfield: 'date',
      sortdirection: 'desc',
      limit: 5,
      offset: 10,
    });
  });
});

describe('gyg_get_tour_availability', () => {
  it('GETs /tours/{id}/availability with the hyphenated cnt-language and no defaults', async () => {
    const client = makeClient({ tour_id: 23776, available_dates: [] });
    setup(client);
    const result = await handlers.get('gyg_get_tour_availability')!({ tourId: 23776, language: 'de' });
    expect(client.get).toHaveBeenCalledWith(
      '/tours/23776/availability',
      { 'cnt-language': 'de' },
      { defaults: false },
    );
    expect(JSON.parse(result.content[0].text)).toEqual({ tour_id: 23776, available_dates: [] });
  });

  it('falls back to the resolved default language when no language arg is given', async () => {
    const client = makeClient({});
    setup(client);
    await handlers.get('gyg_get_tour_availability')!({ tourId: 1 });
    expect(client.get).toHaveBeenCalledWith('/tours/1/availability', { 'cnt-language': 'en' }, { defaults: false });
  });
});

describe('registration', () => {
  it('registers exactly the five tour tools', () => {
    setup(makeClient({}));
    expect([...handlers.keys()].sort()).toEqual([
      'gyg_get_tour',
      'gyg_get_tour_availability',
      'gyg_get_tour_options',
      'gyg_get_tour_reviews',
      'gyg_search_tours',
    ]);
  });
});
