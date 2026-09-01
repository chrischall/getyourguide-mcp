import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'node:fs';
import { McpToolError } from '@chrischall/mcp-utils';
import { registerHealthcheckTools, CLIENT_ERROR_TEXT } from '../src/tools/health.js';
import type { GYGClient } from '../src/client.js';

function setup(env: Record<string, string | undefined>, probe?: () => Promise<unknown>) {
  const get = vi.fn(probe ?? (async () => ({ categories: [] })));
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerHealthcheckTools(server, { get } as unknown as GYGClient, (k: string) => env[k]);
  const call = async () =>
    JSON.parse((await (server as any)._registeredTools.gyg_healthcheck.handler({}, {})).content[0].text);
  return { server, call, get };
}

const FULL = { GYG_API_KEY: 'KEY' };

describe('gyg_healthcheck', () => {
  it('registers under the repo tool prefix', () => {
    expect(Object.keys((setup(FULL).server as any)._registeredTools)).toEqual(['gyg_healthcheck']);
  });

  it('reports ok when the key resolves and the probe succeeds', async () => {
    expect((await setup(FULL).call()).ok).toBe(true);
  });

  // A rejection on the most broadly available endpoint is about the key, not
  // its scope — which is what makes the hint actionable.
  it('probes the broadly-available taxonomy read, not a tour search', async () => {
    const { call, get } = setup(FULL);
    await call();
    expect(get).toHaveBeenCalledWith('/categories');
  });

  it('reports a missing key as no_credential and skips the probe', async () => {
    const { call, get } = setup({});
    expect((await call()).error.kind).toBe('no_credential');
    expect(get).not.toHaveBeenCalled();
  });

  it('never echoes the key', async () => {
    const out = await setup({ GYG_API_KEY: 'SUPER-SECRET' }).call();
    expect(JSON.stringify(out)).not.toContain('SUPER-SECRET');
  });

  it('reports a rejected key as credential_rejected, pointing at the key not its scope', async () => {
    // Built the way client.ts builds it: status summary on the message, the
    // actionable text on the HINT. Matching only the message is the bug.
    const out = await setup(FULL, async () => {
      throw new McpToolError('GetYourGuide GET /categories failed with 401', {
        hint: 'The API key was rejected. Either GYG_API_KEY is wrong, or the key does not have access to this endpoint.',
      });
    }).call();
    expect(out.error.kind).toBe('credential_rejected');
    expect(out.hint).toMatch(/key itself rather than its scope/);
  });

  it('separates rate limiting from a rejected key', async () => {
    const out = await setup(FULL, async () => {
      throw new McpToolError('GetYourGuide GET /categories failed with 429', {
        hint: 'Rate limited even after one retry — wait a minute before trying again, and space out bulk lookups.',
      });
    }).call();
    expect(out.error.kind).toBe('rate_limited');
    expect(out.error.kind).not.toBe('credential_rejected');
  });

  it('classifies the client\'s own unset-key error as no_credential', async () => {
    const out = await setup(FULL, async () => { throw new Error('GYG_API_KEY is not set — the GetYourGuide Partner API requires an API key on every request.'); }).call();
    expect(out.error.kind).toBe('no_credential');
  });

  it('leaves an unrecognised failure to the helper defaults', async () => {
    const out = await setup(FULL, async () => { throw new Error('socket hang up'); }).call();
    expect(out.ok).toBe(false);
    expect(out.error.kind).not.toBe('rate_limited');
  });

  // A 503 carries the RATE-LIMIT hint, not the auth one. Classifying on a
  // status code alone would misread it as an auth failure.
  it('reads a persisting 503 as rate limiting, not a rejected key', async () => {
    const out = await setup(FULL, async () => {
      throw new McpToolError('GetYourGuide GET /categories failed with 503', {
        hint: 'Rate limited even after one retry — wait a minute before trying again, and space out bulk lookups.',
      });
    }).call();
    expect(out.error.kind).toBe('rate_limited');
  });

  // The status-code fallbacks exist for the case client.ts does NOT attach a
  // known hint — a raw upstream error, or a reworded one. Without a hint that
  // matches, only the status makes these decisive, which is exactly what the
  // review on #64 found untested.
  it('falls back to the status code when no known hint is attached', async () => {
    const rejected = await setup(FULL, async () => { throw new Error('GetYourGuide GET /categories failed with 401'); }).call();
    expect(rejected.error.kind).toBe('credential_rejected');

    const limited = await setup(FULL, async () => { throw new Error('GetYourGuide GET /categories failed with 429'); }).call();
    expect(limited.error.kind).toBe('rate_limited');
  });

  it('does not mistake an unrelated number for a status code', async () => {
    const out = await setup(FULL, async () => { throw new Error('read 401503 bytes then failed'); }).call();
    expect(out.error.kind).not.toBe('credential_rejected');
    expect(out.error.kind).not.toBe('rate_limited');
  });

  // The guard for the class of bug the auto-review caught.
  it('keys only on text client.ts actually produces', () => {
    const clientSource = readFileSync(new URL('../src/client.ts', import.meta.url), 'utf8');
    for (const [arm, text] of Object.entries(CLIENT_ERROR_TEXT)) {
      expect(clientSource, `${arm}: "${text}" no longer appears in client.ts`).toContain(text);
    }
  });

  it('classifies a non-Error throw without crashing', async () => {
    const out = await setup(FULL, async () => { throw 'Rate limited even after one retry'; }).call();
    expect(out.error.kind).toBe('rate_limited');
  });

  it('reads the real environment when no reader is injected', async () => {
    vi.stubEnv('GYG_API_KEY', 'REAL-KEY');
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerHealthcheckTools(server, { get: vi.fn(async () => ({})) } as any);
    const out = JSON.parse(
      (await (server as any)._registeredTools.gyg_healthcheck.handler({}, {})).content[0].text,
    );
    expect(out.credential.resolved).toBe(true);
    expect(JSON.stringify(out)).not.toContain('REAL-KEY');
    vi.unstubAllEnvs();
  });
});
