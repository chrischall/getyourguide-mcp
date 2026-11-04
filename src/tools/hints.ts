/**
 * Context-group hints, published on each tool as `_meta.mint` (the mcp-host
 * context-groups contract). Inert data: a host that does not read them sees
 * an extra `_meta` key and nothing else. The shape is fixed by the host's
 * contract, so it is restated here rather than imported.
 *
 * Every tool here is in the `travel` group, and every one is a `lookup`.
 * GetYourGuide's Partner API is a public catalogue — tours, categories,
 * locations, reviews — with nothing that is the person's own (no bookings,
 * no wishlist), so no tool answers a "what's new / due / on" question about
 * them: nothing is `canonical`, and there is no `subject` (the subjects a
 * host fans out over are the person's own, never a public directory).
 * `aliases` are the words a person says (lowercase, ≤ 8, each ≤ 40 chars).
 */
export type MintIntent =
  | 'whats-new' | 'whats-due' | 'whats-on' | 'lookup' | 'turn-on-off' | 'send' | 'change' | 'other';

export interface MintHint {
  domain: 'travel';
  intent: MintIntent;
  canonical?: true;
  subject?: string;
  when?: { start: string; end: string };
  aliases?: string[];
}

/** `_meta` for a GetYourGuide tool. */
export function travelMeta(
  intent: MintIntent,
  extra: Omit<MintHint, 'domain' | 'intent'> = {},
): { mint: MintHint } {
  return { mint: { domain: 'travel', intent, ...extra } };
}
