import { parseLenient } from '@chrischall/mcp-utils';
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
 * Thin wrapper over @chrischall/mcp-utils' shared `parseLenient` (the
 * consolidation of the fleet's `parseGYG`/`parseOFW`/`parseAllTrails` triplet),
 * keeping the local `(schema, raw, ctx)` call shape the tools use — `ctx` (e.g.
 * `GET /tours`) becomes the warning's context so the stderr signal still names
 * the endpoint and the drifted fields.
 */
export function parseGYG<S extends z.ZodType>(schema: S, raw: unknown, ctx: string): z.output<S> {
  return parseLenient(schema, raw, { label: 'getyourguide-mcp', context: ctx }) as z.output<S>;
}
