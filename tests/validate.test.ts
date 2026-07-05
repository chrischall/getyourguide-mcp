import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { parseGYG } from '../src/validate.js';

afterEach(() => vi.restoreAllMocks());

const Envelope = z.looseObject({
  data: z.looseObject({ tours: z.array(z.unknown()) }),
});

describe('parseGYG', () => {
  it('returns the parsed value on success, preserving unknown fields', () => {
    const raw = { data: { tours: [{ tour_id: 1 }], extra: 'kept' }, _metadata: { count: 1 } };
    const result = parseGYG(Envelope, raw, 'GET /tours');
    expect(result).toEqual(raw);
  });

  it('warns to stderr and returns the raw response on mismatch', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = { data: { tours: 'not-an-array' } };
    const result = parseGYG(Envelope, raw, 'GET /tours');
    expect(result).toBe(raw);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain('GET /tours');
    expect(message).toContain('data.tours');
  });

  it('labels root-level issues as (root)', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    parseGYG(z.string(), 42, 'GET /categories');
    expect(warn.mock.calls[0][0]).toContain('(root)');
  });
});
