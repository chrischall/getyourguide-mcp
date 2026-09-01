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

export function classifyGygError(err: unknown): { kind: string; hint?: string } | undefined {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('Rate limited')) {
    return {
      kind: 'rate_limited',
      hint: 'GetYourGuide rate-limited the probe even after a retry. The key is fine — wait a minute.',
    };
  }
  if (msg.includes('API key was rejected') || /401|403/.test(msg)) {
    return {
      kind: 'credential_rejected',
      hint:
        'GetYourGuide rejected the key on /categories — the most broadly available endpoint there is, so this ' +
        'points at the key itself rather than its scope. Check GYG_API_KEY at https://partner.getyourguide.com.',
    };
  }
  if (msg.includes('is not set')) return { kind: 'no_credential' };
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
