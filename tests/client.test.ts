import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_BASE_URL,
  DEFAULT_RETRY_DELAY_MS,
  GYGClient,
  RETRY_AFTER_CAP_MS,
  requestTimeoutMs,
  resolveBaseUrl,
  retryDelayMs,
} from '../src/client.js';
import { VERSION } from '../src/version.js';

const ENV_KEYS = ['GYG_API_KEY', 'GYG_BASE_URL', 'GYG_CURRENCY', 'GYG_LANGUAGE', 'GYG_REQUEST_TIMEOUT_MS'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers });
}

function makeClient(responses: Response[]): { client: GYGClient; fetchFn: ReturnType<typeof vi.fn>; sleeps: number[] } {
  const fetchFn = vi.fn();
  for (const response of responses) fetchFn.mockResolvedValueOnce(response);
  const sleeps: number[] = [];
  const client = new GYGClient({
    fetchFn: fetchFn as unknown as typeof fetch,
    sleepFn: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, fetchFn, sleeps };
}

describe('resolveBaseUrl', () => {
  it('defaults to the Partner API base', () => {
    expect(resolveBaseUrl()).toBe(DEFAULT_BASE_URL);
  });

  it('honors GYG_BASE_URL and strips trailing slashes', () => {
    process.env.GYG_BASE_URL = 'https://example.com/api/';
    expect(resolveBaseUrl()).toBe('https://example.com/api');
  });
});

describe('requestTimeoutMs', () => {
  it('defaults to 30s', () => {
    expect(requestTimeoutMs()).toBe(30_000);
  });

  it('honors a valid GYG_REQUEST_TIMEOUT_MS', () => {
    process.env.GYG_REQUEST_TIMEOUT_MS = '5000';
    expect(requestTimeoutMs()).toBe(5000);
  });

  it('falls back on a non-numeric value', () => {
    process.env.GYG_REQUEST_TIMEOUT_MS = 'abc';
    expect(requestTimeoutMs()).toBe(30_000);
  });

  it('falls back on a non-positive value', () => {
    process.env.GYG_REQUEST_TIMEOUT_MS = '-1';
    expect(requestTimeoutMs()).toBe(30_000);
  });
});

describe('retryDelayMs', () => {
  it('defaults when the header is missing', () => {
    expect(retryDelayMs(null)).toBe(DEFAULT_RETRY_DELAY_MS);
  });

  it('defaults on a non-numeric header', () => {
    expect(retryDelayMs('later')).toBe(DEFAULT_RETRY_DELAY_MS);
  });

  it('defaults on a negative header', () => {
    expect(retryDelayMs('-2')).toBe(DEFAULT_RETRY_DELAY_MS);
  });

  it('converts seconds to ms', () => {
    expect(retryDelayMs('3')).toBe(3000);
  });

  it('honors zero', () => {
    expect(retryDelayMs('0')).toBe(0);
  });

  it('caps large values', () => {
    expect(retryDelayMs('60')).toBe(RETRY_AFTER_CAP_MS);
  });
});

describe('GYGClient.get', () => {
  it('throws an actionable deferred-config error when GYG_API_KEY is unset', async () => {
    const { client, fetchFn } = makeClient([]);
    await expect(client.get('/tours')).rejects.toMatchObject({
      message: expect.stringContaining('GYG_API_KEY'),
      hint: expect.stringContaining('partner.getyourguide.com'),
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('GETs the path with auth headers and parses JSON', async () => {
    process.env.GYG_API_KEY = 'test-key';
    const { client, fetchFn } = makeClient([jsonResponse({ data: { tours: [] } })]);
    const result = await client.get('/tours');
    expect(result).toEqual({ data: { tours: [] } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${DEFAULT_BASE_URL}/tours`);
    expect(init.headers['X-ACCESS-TOKEN']).toBe('test-key');
    expect(init.headers.Accept).toBe('application/json');
    expect(init.headers['User-Agent']).toContain(`getyourguide-mcp/${VERSION}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('injects GYG_CURRENCY / GYG_LANGUAGE defaults and drops undefined params', async () => {
    process.env.GYG_API_KEY = 'test-key';
    process.env.GYG_CURRENCY = 'USD';
    process.env.GYG_LANGUAGE = 'en';
    const { client, fetchFn } = makeClient([jsonResponse({})]);
    await client.get('/tours', { q: 'louvre', locationId: undefined });
    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain('currency=USD');
    expect(url).toContain('cnt-language=en');
    expect(url).toContain('q=louvre');
    expect(url).not.toContain('locationId');
  });

  it('lets an explicit per-call param beat the env default', async () => {
    process.env.GYG_API_KEY = 'test-key';
    process.env.GYG_CURRENCY = 'USD';
    const { client, fetchFn } = makeClient([jsonResponse({})]);
    await client.get('/tours', { currency: 'EUR' });
    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain('currency=EUR');
    expect(url).not.toContain('USD');
  });

  it('retries once on 429 honoring Retry-After, then succeeds', async () => {
    process.env.GYG_API_KEY = 'test-key';
    const { client, fetchFn, sleeps } = makeClient([
      jsonResponse({}, 429, { 'retry-after': '3' }),
      jsonResponse({ ok: true }),
    ]);
    const result = await client.get('/tours');
    expect(result).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([3000]);
  });

  it('retries once on 503 with the default delay when Retry-After is missing', async () => {
    process.env.GYG_API_KEY = 'test-key';
    const { client, sleeps } = makeClient([jsonResponse({}, 503), jsonResponse({ ok: true })]);
    await client.get('/tours');
    expect(sleeps).toEqual([DEFAULT_RETRY_DELAY_MS]);
  });

  it('surfaces a rate-limit error when the retry also fails', async () => {
    process.env.GYG_API_KEY = 'test-key';
    const { client } = makeClient([
      jsonResponse({}, 429, { 'retry-after': '0' }),
      jsonResponse({ message: 'slow down' }, 429),
    ]);
    await expect(client.get('/tours')).rejects.toMatchObject({
      message: expect.stringContaining('GetYourGuide error 429'),
      hint: expect.stringContaining('Rate limited'),
    });
  });

  it('throws an actionable auth error on 401', async () => {
    process.env.GYG_API_KEY = 'bad-key';
    const { client } = makeClient([jsonResponse({ error: 'invalid key' }, 401)]);
    await expect(client.get('/tours')).rejects.toMatchObject({
      message: expect.stringContaining('GetYourGuide error 401'),
      hint: expect.stringContaining('partner tier'),
    });
  });

  it('throws the same auth error shape on 403', async () => {
    process.env.GYG_API_KEY = 'bad-key';
    const { client } = makeClient([jsonResponse({}, 403)]);
    await expect(client.get('/tours')).rejects.toMatchObject({
      message: expect.stringContaining('GetYourGuide error 403'),
    });
  });

  it('formats other upstream errors through formatApiError', async () => {
    process.env.GYG_API_KEY = 'test-key';
    const { client } = makeClient([jsonResponse({ error: 'boom' }, 500)]);
    await expect(client.get('/tours/1')).rejects.toMatchObject({
      message: expect.stringContaining('GetYourGuide error 500 for GET /tours/1'),
    });
  });

  it('throws an actionable error on a non-JSON 2xx body', async () => {
    process.env.GYG_API_KEY = 'test-key';
    const { client } = makeClient([new Response('<html>interstitial</html>', { status: 200 })]);
    await expect(client.get('/tours')).rejects.toMatchObject({
      message: expect.stringContaining('non-JSON'),
      hint: expect.stringContaining('GYG_BASE_URL'),
    });
  });

  it('uses the real global fetch and setTimeout sleep by default', async () => {
    process.env.GYG_API_KEY = 'test-key';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new GYGClient();
    const result = await client.get('/tours');
    expect(result).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
