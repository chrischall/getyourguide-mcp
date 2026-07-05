import type { z } from 'zod';

/**
 * Validate a GetYourGuide API response against a zod schema at the call site.
 *
 * The Partner API response shapes this server codes against could not be
 * live-verified at build time (see docs/GETYOURGUIDE-API.md), and any real
 * API drifts — so schemas are `.looseObject(...)` covering ONLY the fields
 * the code actually reads, and validation is **lenient**: on mismatch, log a
 * structured warning to stderr naming the endpoint and fields, then return
 * the RAW response unchanged so the tool stays useful (degrade, never break).
 *
 * The warning text is deliberately precise ("data.tours: expected array…") —
 * it's the failure signal a maintainer (human or Claude) fixes in one
 * session, vs. "search sometimes looks empty".
 */
export function parseGYG<S extends z.ZodType>(schema: S, raw: unknown, ctx: string): z.output<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  console.error(
    `[getyourguide-mcp] WARNING: response for ${ctx} failed validation: ${issues} — ` +
      'continuing with the raw response; fields derived from it may be missing or wrong.',
  );
  return raw as z.output<S>;
}
