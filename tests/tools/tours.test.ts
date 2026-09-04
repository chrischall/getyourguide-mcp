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
    const result = await handlers.get('gyg_search_tours')!({ view: 'full',
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
    await handlers.get('gyg_search_tours')!({ view: 'full', dateFrom: '2026-08-01T12:30:00' });
    expect(client.get).toHaveBeenCalledWith('/tours', expect.objectContaining({ 'date[]': ['2026-08-01T12:30:00'] }));
  });

  it('rejects dateTo without dateFrom with an actionable error', async () => {
    const client = makeClient(envelope);
    setup(client);
    await expect(handlers.get('gyg_search_tours')!({ view: 'full', dateTo: '2026-08-05' })).rejects.toMatchObject({
      message: expect.stringContaining('dateTo was given without dateFrom'),
      hint: expect.stringContaining('dateFrom'),
    });
    expect(client.get).not.toHaveBeenCalled();
  });

  it('returns compact summaries when compact=true', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_search_tours')!({ view: 'compact' });
    expect(JSON.parse(result.content[0].text)).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 23776, title: 'Louvre' }],
    });
  });

  // Compact used to be `compact: true` — opt-in, with the tool description asking
  // the caller to pass it. The whole point of the rollout is that a caller who
  // passes NO view argument at all now gets the slim answer, so that call is
  // spelled out here rather than left implied by the `view: 'compact'` case above.
  it('projects by default when no view argument is passed', async () => {
    const client = makeClient(envelope);
    setup(client);
    const result = await handlers.get('gyg_search_tours')!({});
    expect(JSON.parse(result.content[0].text)).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 23776, title: 'Louvre' }],
    });
  });

  // `view` is a response-shape knob of ours; GetYourGuide has never heard of it.
  // This handler builds its query object field by field, and this pins that: the
  // params must be byte-identical whether or not a caller named a rung. (The
  // `extraParams` escape hatch is the only route to the wire, and it is explicit.)
  it('never sends view upstream as a query param', async () => {
    const client = makeClient(envelope);
    setup(client);
    await handlers.get('gyg_search_tours')!({ q: 'louvre' });
    const withoutView = (client.get as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1];

    setup(client);
    await handlers.get('gyg_search_tours')!({ q: 'louvre', view: 'full' });
    const withView = (client.get as unknown as { mock: { calls: unknown[][] } }).mock.calls[1][1];

    expect(withView).toEqual(withoutView);
    expect(Object.keys(withView as object)).not.toContain('view');
  });

  // Minification is the other half of the change: `jsonResponse` pretty-prints,
  // `viewResponse` does not. Asserted on the raw text because both parse
  // identically, so no content assertion in this file can tell them apart.
  it('emits one line of JSON on both rungs', async () => {
    const client = makeClient(envelope);
    setup(client);
    for (const args of [{}, { view: 'full' }]) {
      const result = await handlers.get('gyg_search_tours')!(args);
      expect(result.content[0].text).not.toMatch(/\n/);
    }
  });

  it('degrades to the raw response on envelope drift', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const drifted = { activities: [] };
    const client = makeClient(drifted);
    setup(client);
    const result = await handlers.get('gyg_search_tours')!({ view: 'compact' });
    expect(JSON.parse(result.content[0].text)).toEqual(drifted);
    expect(warn).toHaveBeenCalled();
  });
});

describe('gyg_get_tour', () => {
  // One record, carrying the picture size variants COMPACT_TOUR_KEYS calls fat
  // and a coordinate block the listing projection also drops.
  const record = {
    tour_id: 23776,
    title: 'Louvre',
    abstract: 'Skip the line.',
    pictures: [
      { url: 'https://cdn.getyourguide.com/img/tour/abc/145.jpg', size: 145 },
      { url: 'https://cdn.getyourguide.com/img/tour/abc/68.jpg', size: 68 },
    ],
    coordinates: { lat: 48.86, lng: 2.33 },
  };

  it('GETs /tours/{id} with currency/language overrides', async () => {
    const client = makeClient(record);
    setup(client);
    const result = await handlers.get('gyg_get_tour')!({ tourId: 23776, currency: 'USD', language: 'de' });
    expect(client.get).toHaveBeenCalledWith('/tours/23776', { currency: 'USD', cnt_language: 'de' });
    expect(result.content[0].type).toBe('text');
  });

  // This tool is what makes the media-strip rung a live path rather than dead
  // code: it answers a single record, so there is no `data.tours` array for the
  // grounded projection to read, and the subtractive rule is the honest ceiling.
  // Compact must drop the pictures and keep everything else — including the
  // coordinates the LISTING projection deliberately throws away, because nothing
  // here claims to know which of GetYourGuide's fields a caller needs.
  it('strips pictures but keeps every other field when no view argument is passed', async () => {
    const client = makeClient(record);
    setup(client);
    const result = await handlers.get('gyg_get_tour')!({ tourId: 23776 });
    expect(JSON.parse(result.content[0].text)).toEqual({
      tour_id: 23776,
      title: 'Louvre',
      abstract: 'Skip the line.',
      coordinates: { lat: 48.86, lng: 2.33 },
    });
  });

  // A field GetYourGuide adds next month survives the default rung. This is the
  // promise a guessed field list could not make, and it is why `gyg_get_tour`
  // does NOT opt into `tours: true`.
  it('passes through a field nobody anticipated', async () => {
    const client = makeClient({ ...record, somethingNobodyAnticipated: { nested: [1, 2] } });
    setup(client);
    const result = await handlers.get('gyg_get_tour')!({ tourId: 23776 });
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      somethingNobodyAnticipated: { nested: [1, 2] },
    });
  });

  it('returns the pictures under view: "full"', async () => {
    const client = makeClient(record);
    setup(client);
    const result = await handlers.get('gyg_get_tour')!({ tourId: 23776, view: 'full' });
    expect(JSON.parse(result.content[0].text)).toEqual(record);
  });

  // `view` must not reach GetYourGuide: the query params are identical with and
  // without it.
  it('never sends view upstream as a query param', async () => {
    const client = makeClient(record);
    setup(client);
    await handlers.get('gyg_get_tour')!({ tourId: 23776, view: 'full' });
    expect(client.get).toHaveBeenCalledWith('/tours/23776', {
      currency: undefined,
      cnt_language: undefined,
    });
  });

  it('emits one line of JSON', async () => {
    const client = makeClient(record);
    setup(client);
    const result = await handlers.get('gyg_get_tour')!({ tourId: 23776 });
    expect(result.content[0].text).not.toMatch(/\n/);
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
