import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { GYGClient } from '../../src/client.js';
import { registerTourTools } from '../../src/tools/tours.js';
import { registerTaxonomyTools } from '../../src/tools/taxonomy.js';
import { registerHealthcheckTools } from '../../src/tools/health.js';

/**
 * Context-group hints (`_meta.mint`, the mcp-host context-groups contract),
 * read off `tools/list` — what a host actually sees.
 *
 * GetYourGuide is a public catalogue: nothing here is the person's own (no
 * bookings, no saved items), so nothing answers "what's new / due / on" for
 * them. Every tool is a `lookup`, none is canonical, and none names a
 * subject — the contract's valid "lookup hints only" outcome.
 */
type Listed = {
  name: string;
  annotations?: Record<string, unknown>;
  inputSchema: { properties?: Record<string, unknown> };
  _meta?: { mint?: Record<string, unknown> };
};

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const CANONICAL_INTENTS = ['whats-new', 'whats-due', 'whats-on'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];

/** The intent every tool declares — this table is the assertion. */
const EXPECTED_INTENT: Record<string, string> = {
  gyg_search_tours: 'lookup',
  gyg_get_tour: 'lookup',
  gyg_get_tour_options: 'lookup',
  gyg_get_tour_availability: 'lookup',
  gyg_get_tour_reviews: 'lookup',
  gyg_list_categories: 'lookup',
  gyg_list_category_tours: 'lookup',
  gyg_get_location: 'lookup',
  gyg_list_location_tours: 'lookup',
};

async function listed(): Promise<Listed[]> {
  const client = new GYGClient();
  const h = await createTestHarness((server) => {
    registerTourTools(server, client);
    registerTaxonomyTools(server, client);
    registerHealthcheckTools(server, client, () => undefined);
  });
  const { tools } = await h.client.listTools();
  await h.close();
  return tools as Listed[];
}

describe('_meta.mint context-group hints', () => {
  it('enumerates every served tool: the healthcheck plus the table', async () => {
    const names = (await listed()).map((t) => t.name).sort();
    expect(names).toEqual([...Object.keys(EXPECTED_INTENT), 'gyg_healthcheck'].sort());
  });

  it('every tool except the healthcheck is in the travel group with its intent', async () => {
    for (const t of await listed()) {
      if (t.name.endsWith('_healthcheck')) continue;
      const m = t._meta?.mint;
      expect(m, t.name).toBeDefined();
      expect(Object.keys(m!).every((k) => KEYS.includes(k)), t.name).toBe(true);
      expect(DOMAINS).toContain(m!.domain);
      expect(m!.domain, t.name).toBe('travel');
      expect(INTENTS).toContain(m!.intent);
      expect(m!.intent, t.name).toBe(EXPECTED_INTENT[t.name]);
    }
  });

  it('aliases are the words a person says: ≤ 8, lowercase, ≤ 40 chars, never a tool name', async () => {
    for (const t of await listed()) {
      const aliases = t._meta?.mint?.aliases as string[] | undefined;
      if (!aliases) continue;
      expect(aliases.length, t.name).toBeLessThanOrEqual(8);
      for (const a of aliases) {
        expect(a.length, t.name).toBeLessThanOrEqual(40);
        expect(a, t.name).toBe(a.toLowerCase());
        expect(a, t.name).not.toMatch(/^gyg_/);
      }
    }
  });

  it('a subject or a when names arguments the tool actually takes', async () => {
    for (const t of await listed()) {
      const m = t._meta?.mint;
      if (!m) continue;
      const props = t.inputSchema.properties ?? {};
      if (m.subject !== undefined) expect(props, t.name).toHaveProperty(m.subject as string);
      if (m.when !== undefined) {
        const w = m.when as { start: string; end: string };
        expect(props, t.name).toHaveProperty(w.start);
        expect(props, t.name).toHaveProperty(w.end);
      }
    }
  });

  it('canonical only on read-only whats-* reads, at most one per intent — and none here', async () => {
    const tools = await listed();
    const canonical = tools.filter((t) => t._meta?.mint?.canonical === true);
    for (const t of canonical) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(CANONICAL_INTENTS).toContain(t._meta!.mint!.intent);
    }
    for (const intent of CANONICAL_INTENTS) {
      expect(canonical.filter((t) => t._meta!.mint!.intent === intent).length, intent).toBeLessThanOrEqual(1);
    }
    // A public catalogue answers no what's-new/due/on question about the person.
    expect(canonical).toEqual([]);
  });

  it('names no subject: the catalogue has no listable subjects of the person', async () => {
    for (const t of await listed()) expect(t._meta?.mint?.subject, t.name).toBeUndefined();
  });

  it('gives every hinted tool the words people say for it', async () => {
    for (const t of await listed()) {
      if (t.name.endsWith('_healthcheck')) continue;
      expect((t._meta?.mint?.aliases as string[] | undefined)?.length ?? 0, t.name).toBeGreaterThan(0);
    }
  });
});
