import { describe, it, expect, vi, afterEach } from 'vitest';
import { GYG_VIEWS, viewArg, viewResponse } from '../src/view.js';

afterEach(() => vi.restoreAllMocks());

/** The text a tool result actually carries, which is the thing under test. */
function textOf(result: ReturnType<typeof viewResponse>): string {
  return (result.content[0] as { text: string }).text;
}

/** …parsed back, for the assertions that are about content rather than bytes. */
function parse<T = Record<string, unknown>>(result: ReturnType<typeof viewResponse>): T {
  return JSON.parse(textOf(result)) as T;
}

/** A listing envelope in the shape `compactTours` was written against. */
const envelope = {
  _metadata: { totalCount: 1 },
  data: {
    tours: [
      {
        tour_id: 23776,
        title: 'Louvre',
        price: { values: { amount: '65.00' } },
        pictures: [{ url: 'https://cdn.getyourguide.com/img/tour/abc/145.jpg' }],
        coordinates: { lat: 48.86, lng: 2.33 },
      },
    ],
  },
};

describe('viewResponse — the projected path (tours: true)', () => {
  // The rollout's whole claim. `compact` used to be `compact: true`, opt-in, with
  // the tool description asking the caller to please pass it; the point of the
  // change is that a caller who says nothing at all now gets the slim answer.
  it('projects by default, with no view argument passed', () => {
    expect(parse(viewResponse(undefined, envelope, { tours: true }))).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 23776, title: 'Louvre', price: { values: { amount: '65.00' } } }],
    });
  });

  // The escape hatch. `full` is what a caller reaches for when they need one of
  // the fields the projection does not carry — the coordinates and picture
  // variants above — so it must be the payload untouched, envelope and all.
  it('returns the validated payload untouched under view: "full"', () => {
    expect(parse(viewResponse('full', envelope, { tours: true }))).toEqual(envelope);
  });

  // The projection is an ALLOWLIST written with knowledge of the API, so unlike
  // the media-strip rung it deliberately does NOT carry a field nobody
  // enumerated. That is the grounded trade this repo made, and it is worth
  // pinning explicitly so nobody "fixes" it into a subtractive rule: the cost is
  // paid for with `full`, which is asserted here in the same breath.
  it('drops an unenumerated field on the projected rung, and full gives it back', () => {
    const drifted = {
      _metadata: {},
      data: { tours: [{ tour_id: 1, title: 'T', somethingNobodyAnticipated: 'new field' }] },
    };
    expect(parse<{ tours: Array<Record<string, unknown>> }>(
      viewResponse(undefined, drifted, { tours: true }),
    ).tours[0]).toEqual({ tour_id: 1, title: 'T' });
    expect(parse(viewResponse('full', drifted, { tours: true }))).toEqual(drifted);
  });

  // Drift on the projected path degrades rather than empties: when `data.tours`
  // is not where `compactTours` expects it, the RAW payload comes back with a
  // stderr warning. An empty projection is indistinguishable from "there was
  // nothing there", which is the false negative worth more than the bytes.
  it('hands back the raw payload, loudly, when data.tours is not an array', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const drifted = { activities: [{ id: 1 }] };
    expect(parse(viewResponse(undefined, drifted, { tours: true }))).toEqual(drifted);
    expect(warn).toHaveBeenCalled();
  });
});

describe('viewResponse — the media-strip path (no tours flag)', () => {
  // The arm `gyg_get_tour` takes: one record, no listing envelope to project.
  // This is the SUBTRACTIVE rung, so the promise is the opposite of the one
  // above — a field this repo has never heard of must survive, because nothing
  // here claims to know which of GetYourGuide's fields matter.
  it('strips media and keeps every other field, including ones nobody anticipated', () => {
    const record = {
      tour_id: 23776,
      title: 'Louvre',
      pictures: [{ url: 'https://cdn.getyourguide.com/img/tour/abc/145.jpg' }],
      cover_image: 'https://cdn.getyourguide.com/x.jpg',
      coordinates: { lat: 48.86, lng: 2.33 },
      somethingNobodyAnticipated: { nested: ['keep', 'me'] },
    };
    expect(parse(viewResponse(undefined, record))).toEqual({
      tour_id: 23776,
      title: 'Louvre',
      coordinates: { lat: 48.86, lng: 2.33 },
      somethingNobodyAnticipated: { nested: ['keep', 'me'] },
    });
  });

  // `opts` defaulting to `{}` is what makes the two-argument call above legal at
  // all; it is a real branch, and the repo's coverage gate is 100%.
  it('treats an explicit empty opts the same as none', () => {
    const record = { tour_id: 1, picture: 'https://cdn.getyourguide.com/x.jpg' };
    expect(parse(viewResponse(undefined, record, {}))).toEqual({ tour_id: 1 });
    expect(parse(viewResponse(undefined, record))).toEqual({ tour_id: 1 });
  });

  // `tours: false` must mean the media rung, not "no rung at all".
  it('takes the media rung for tours: false', () => {
    const record = { tour_id: 1, thumbnail: 'https://cdn.getyourguide.com/x.jpg', title: 'T' };
    expect(parse(viewResponse(undefined, record, { tours: false }))).toEqual({ tour_id: 1, title: 'T' });
  });

  it('returns the record untouched under view: "full"', () => {
    const record = { tour_id: 1, pictures: [{ url: 'https://cdn.getyourguide.com/x.jpg' }] };
    expect(parse(viewResponse('full', record))).toEqual(record);
  });

  // A null is an answer ("no rating yet"), not an absence, and the subtractive
  // rule must not collapse the two.
  it('keeps nulls and empty strings', () => {
    const record = { overall_rating: null, abstract: '', number_of_ratings: 0 };
    expect(parse(viewResponse(undefined, record))).toEqual(record);
  });
});

describe('viewResponse — shared behaviour on both rungs', () => {
  // Minifying drops FORMATTING whitespace only. A tour abstract is where that
  // bites — paragraph breaks carry the shape of the text — so the round trip is
  // compared byte-for-byte on every rung and both paths. A hand-rolled minifier
  // (a regex over the serialised text, a collapse of \s+) fails here and nowhere
  // else in this file.
  it('leaves whitespace inside a value byte-identical', () => {
    const abstract = 'Skip the line.\n\n  Guided, 2h.\n\tMeeting point: Pyramid.\n\nEnds inside.';
    const listing = { _metadata: {}, data: { tours: [{ tour_id: 1, abstract }] } };

    for (const view of [undefined, 'compact', 'full']) {
      expect(
        parse<{ abstract: string }>(viewResponse(view, { abstract })).abstract,
      ).toBe(abstract);
      expect(
        parse<{ tours: Array<{ abstract: string }>; data?: { tours: Array<{ abstract: string }> } }>(
          viewResponse(view, listing, { tours: true }),
        ),
      ).toMatchObject(view === 'full' ? { data: { tours: [{ abstract }] } } : { tours: [{ abstract }] });
    }
  });

  // The saving itself. Checked on the serialised bytes, because a pretty-printed
  // result parses identically and would sail past every assertion above —
  // `jsonResponse` (which these tools used to return) pretty-prints.
  it('emits a single line of text on every rung and both paths', () => {
    for (const view of [undefined, 'compact', 'full']) {
      for (const opts of [{}, { tours: true }]) {
        const text = textOf(viewResponse(view, envelope, opts));
        expect(text).not.toMatch(/\n|\r/);
      }
    }
  });

  // This server honours two rungs, not the fleet's three. A caller that names
  // `raw` gets the cheap answer rather than an exception: a small correct
  // response beats a failed tool call for a mistake the caller cannot see they
  // made. The schema is the first line of defence (below); this is the second.
  it('falls back to compact for a rung this server does not honour', () => {
    expect(GYG_VIEWS).not.toContain('raw');
    expect(parse(viewResponse('raw', envelope, { tours: true }))).toEqual({
      _metadata: { totalCount: 1 },
      tours: [{ tour_id: 23776, title: 'Louvre', price: { values: { amount: '65.00' } } }],
    });
    expect(parse(viewResponse('nonsense', { picture: 'https://x/y.jpg', id: 1 }))).toEqual({ id: 1 });
  });
});

describe('viewArg', () => {
  // The schema must advertise only what src/view.ts can honour, or a host shows
  // the model a rung that silently aliases to another one.
  it('accepts the honoured rungs and rejects the ones this server cannot answer', () => {
    const schema = viewArg();
    expect(schema.parse(undefined)).toBeUndefined();
    for (const rung of GYG_VIEWS) expect(schema.parse(rung)).toBe(rung);
    expect(schema.safeParse('raw').success).toBe(false);
  });

  // The description is the only place a caller learns what compact costs them.
  // `.describe()` has to land on the OPTIONAL wrapper — applied to the inner enum
  // it comes back blank, which is a parameter documented to nobody.
  it('carries the per-tool note on the wrapper a host actually reads', () => {
    expect(viewArg().description).toContain('slim tour projection');
  });
});
