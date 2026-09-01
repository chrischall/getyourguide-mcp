import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerHealthcheckTools } from '../src/tools/health.js';
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
    const out = await setup(FULL, async () => { throw new Error('The API key was rejected. Either GYG_API_KEY is wrong, or the key does not have access to this endpoint.'); }).call();
    expect(out.error.kind).toBe('credential_rejected');
    expect(out.hint).toMatch(/key itself rather than its scope/);
  });

  it('separates rate limiting from a rejected key', async () => {
    const out = await setup(FULL, async () => { throw new Error('Rate limited even after one retry — wait a minute'); }).call();
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
