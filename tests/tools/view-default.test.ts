import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { GYGClient } from '../../src/client.js';
import { registerTourTools } from '../../src/tools/tours.js';
import { registerTaxonomyTools } from '../../src/tools/taxonomy.js';

// The non-listing tools used to answer pretty-printed full payloads with every
// image/avatar URL intact — the most token-hungry responses were the ones
// without the trim. Compact (media-stripped, minified) is the default on
// every tool now; view:"full" restores the whole payload.

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }> }>;

const payload = {
  data: {
    items: [
      {
        id: 7,
        title: 'Kept',
        pictures: [{ url: 'https://cdn.getyourguide.com/img/tour/abc/145.jpg', size: 145 }],
      },
    ],
  },
};

function setup() {
  const client = new GYGClient();
  vi.spyOn(client, 'get').mockResolvedValue(payload);
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  const handlers = new Map<string, ToolHandler>();
  const schemas = new Map<string, { shape: Record<string, unknown> }>();
  const descriptions = new Map<string, string>();
  vi.spyOn(server, 'registerTool').mockImplementation((name: string, config: unknown, cb: unknown) => {
    handlers.set(name, cb as ToolHandler);
    descriptions.set(name, (config as { description: string }).description);
    schemas.set(name, (config as { inputSchema: { shape: Record<string, unknown> } }).inputSchema);
    return undefined as never;
  });
  registerTourTools(server, client);
  registerTaxonomyTools(server, client);
  return { client, handlers, schemas, descriptions };
}

afterEach(() => vi.restoreAllMocks());

const cases: Array<[string, Record<string, unknown>]> = [
  ['gyg_list_categories', {}],
  ['gyg_get_location', { locationId: 1 }],
  ['gyg_get_tour_options', { tourId: 1 }],
  ['gyg_get_tour_availability', { tourId: 1 }],
  ['gyg_get_tour_reviews', { tourId: 1 }],
];

describe.each(cases)('%s view handling', (name, args) => {
  it('takes a view argument', () => {
    expect(setup().schemas.get(name)!.shape.view).toBeDefined();
  });

  // Compact-by-default changed what these tools return (image URLs gone), so
  // the tool description itself must say so — a caller reading only the tool
  // list should learn that view:"full" brings the media back.
  it('says in its description that image URLs are stripped unless view:"full"', () => {
    const description = setup().descriptions.get(name)!;
    expect(description).toMatch(/image URLs are stripped by default/i);
    expect(description).toContain('view:"full"');
  });

  // These tools have no tour projection — compact only strips media — so the
  // view argument's own help text must not promise a slim tour summary.
  it('does not describe its view argument as a tour projection', () => {
    const view = setup().schemas.get(name)!.shape.view as { description?: string };
    expect(view.description).toBeDefined();
    expect(view.description).not.toMatch(/projection/i);
    expect(view.description).toMatch(/image URLs/i);
  });

  it('defaults to compact: one line of JSON, media URLs stripped, other fields kept', async () => {
    const result = await setup().handlers.get(name)!(args);
    expect(result.content[0].text).not.toMatch(/\n/);
    expect(JSON.parse(result.content[0].text)).toEqual({ data: { items: [{ id: 7, title: 'Kept' }] } });
  });

  it('returns the whole payload under view:"full"', async () => {
    const result = await setup().handlers.get(name)!({ ...args, view: 'full' });
    expect(JSON.parse(result.content[0].text)).toEqual(payload);
  });

  it('never sends view upstream', async () => {
    const { client, handlers } = setup();
    await handlers.get(name)!({ ...args, view: 'full' });
    expect(vi.mocked(client.get).mock.calls[0][1]).not.toHaveProperty('view');
  });
});
