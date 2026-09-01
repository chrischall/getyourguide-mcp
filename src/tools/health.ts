import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readEnvVar } from '@chrischall/mcp-utils';
import { registerCredentialHealthcheckTool } from '@chrischall/mcp-utils/healthcheck';
import type { GYGClient } from '../client.js';

/**
 * `gyg_healthcheck` — the one call that answers "is this connector working?",
 * and the only tool here that reports a failure as DATA rather than throwing.
 *
 * GetYourGuide had none, and its rejection case is genuinely two different
 * problems wearing one status code: the client's own error text says the key
 * is either wrong OR lacks access to that endpoint. Those have opposite
 * fixes — replace the key, versus ask the partner program to widen it — so
 * the probe deliberately uses `/categories`, the most broadly available
 * taxonomy read. A rejection THERE is about the key itself, not its scope.
 */

type ReadEnv = (key: string) => string | undefined;

/**
 * Strings this classifier matches, kept as named constants because they are a
 * CONTRACT WITH client.ts, not free text. `tests/health.test.ts` asserts each
 * still appears there.
 *
 * The first version of this classifier matched `err.message` only. client.ts
 * puts its remediation on the HINT — the message is `formatApiError(...)` —
 * so the rate_limited arm could never fire, and credential_rejected worked
 * only by accident through its status-code fallback.
 */
export const CLIENT_ERROR_TEXT = {
  /** client.ts AUTH_HINT, on the hint of a 401/403. */
  rejected: 'The API key was rejected',
  /** client.ts RATE_LIMIT_HINT, on the hint of a persisting 429/503. */
  rateLimited: 'Rate limited even after one retry',
  /** client.ts, when GYG_API_KEY is absent. */
  noKey: 'GYG_API_KEY is not set',
} as const;

export function classifyGygError(err: unknown): { kind: string; hint?: string } | undefined {
  // Search message AND hint: client.ts carries the actionable text on `.hint`
  // and a formatted status summary on `.message`.
  const message = err instanceof Error ? err.message : String(err);
  const hint = typeof (err as { hint?: unknown })?.hint === 'string' ? (err as { hint: string }).hint : '';
  const text = `${message}\n${hint}`;

  if (text.includes(CLIENT_ERROR_TEXT.noKey)) return { kind: 'no_credential' };

  // Checked before the rejection arm: a 503 carries the rate-limit hint, and
  // a status-code match alone would misread it as an auth problem.
  if (text.includes(CLIENT_ERROR_TEXT.rateLimited) || /\b429\b|\b503\b/.test(text)) {
    return {
      kind: 'rate_limited',
      hint: 'GetYourGuide rate-limited the probe even after a retry. The key is fine — wait a minute.',
    };
  }
  if (text.includes(CLIENT_ERROR_TEXT.rejected) || /\b401\b|\b403\b/.test(text)) {
    return {
      kind: 'credential_rejected',
      hint:
        'GetYourGuide rejected the key on /categories — the most broadly available endpoint there is, so this ' +
        'points at the key itself rather than its scope. Check GYG_API_KEY at https://partner.getyourguide.com.',
    };
  }
  return undefined;
}

export function registerHealthcheckTools(
  server: McpServer,
  client: GYGClient,
  /** Seam: injectable so tests need no process env. */
  readEnv: ReadEnv = (k) => readEnvVar(k),
): void {
  registerCredentialHealthcheckTool({
    server,
    prefix: 'gyg',
    hostLabel: 'api.getyourguide.com',
    probePath: '/categories',
    resolveCredential: async () => ({ source: readEnv('GYG_API_KEY') ? 'GYG_API_KEY' : null }),
    // Taxonomy, not a tour search: cheap, stable, and available to every
    // partner key, so a failure here is unambiguous about the key.
    probeFn: () => client.get('/categories'),
    classifyThrown: classifyGygError,
  });
}
