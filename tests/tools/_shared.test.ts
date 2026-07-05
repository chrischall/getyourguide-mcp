import { describe, it, expect, vi, afterEach } from 'vitest';
import { compactTour, compactTours } from '../../src/tools/_shared.js';

afterEach(() => vi.restoreAllMocks());

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
