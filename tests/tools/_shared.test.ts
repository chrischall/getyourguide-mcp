import { describe, it, expect, vi, afterEach } from 'vitest';
import { compactTour, compactTours, dateRangeParam } from '../../src/tools/_shared.js';

afterEach(() => vi.restoreAllMocks());

describe('dateRangeParam', () => {
  it('returns undefined when neither date is given', () => {
    expect(dateRangeParam()).toBeUndefined();
  });

  it('expands a date-only dateFrom to start of day as a single-value range', () => {
    expect(dateRangeParam('2026-08-01')).toEqual(['2026-08-01T00:00:00']);
  });

  it('expands a date-only pair to start/end of day', () => {
    expect(dateRangeParam('2026-08-01', '2026-08-05')).toEqual(['2026-08-01T00:00:00', '2026-08-05T23:59:59']);
  });

  it('passes full datetimes through untouched', () => {
    expect(dateRangeParam('2026-08-01T09:00:00', '2026-08-05T18:00:00')).toEqual([
      '2026-08-01T09:00:00',
      '2026-08-05T18:00:00',
    ]);
  });

  it('rejects dateTo without dateFrom', () => {
    expect(() => dateRangeParam(undefined, '2026-08-05')).toThrowError(/dateTo was given without dateFrom/);
  });
});

describe('compactTour', () => {
  it('keeps only the documented summary fields', () => {
    const fat = {
      tour_id: 23776,
      title: 'Louvre skip-the-line',
      abstract: 'See the Mona Lisa',
      url: 'https://www.getyourguide.com/x-t23776',
      price: { values: { amount: 25 } },
      overall_rating: 4.7,
      number_of_ratings: 1234,
      durations: [{ duration: 2, unit: 'hour' }],
      categories: [{ category_id: 1, name: 'Museums' }],
      locations: [{ location_id: 57, name: 'Paris' }],
      pictures: [{ url: 'huge.jpg' }],
      coordinates: { lat: 48.8, long: 2.3 },
      marketing_blob: 'x'.repeat(5000),
    };
    const slim = compactTour(fat);
    expect(Object.keys(slim).sort()).toEqual(
      [
        'tour_id',
        'title',
        'abstract',
        'url',
        'price',
        'overall_rating',
        'number_of_ratings',
        'durations',
        'categories',
        'locations',
      ].sort(),
    );
    expect(slim.tour_id).toBe(23776);
  });

  it('omits absent fields and tolerates null items', () => {
    expect(compactTour({ title: 'only-title' })).toEqual({ title: 'only-title' });
    expect(compactTour(null)).toEqual({});
  });
});

describe('compactTours', () => {
  it('projects data.tours and carries _metadata through', () => {
    const raw = {
      _metadata: { totalCount: 2 },
      data: { tours: [{ tour_id: 1, pictures: ['fat'] }, { tour_id: 2 }] },
    };
    expect(compactTours(raw)).toEqual({
      _metadata: { totalCount: 2 },
      tours: [{ tour_id: 1 }, { tour_id: 2 }],
    });
  });

  it('omits _metadata when the envelope has none', () => {
    const result = compactTours({ data: { tours: [] } }) as { _metadata?: unknown; tours: unknown[] };
    expect(result.tours).toEqual([]);
    expect(result._metadata).toBeUndefined();
  });

  it('warns and returns the raw response when data.tours is missing', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = { unexpected: true };
    expect(compactTours(raw)).toBe(raw);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('data.tours');
  });

  it('warns when data.tours is not an array', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const raw = { data: { tours: 'nope' } };
    expect(compactTours(raw)).toBe(raw);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('tolerates a null response', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(compactTours(null)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
