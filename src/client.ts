// GetYourGuide Partner API client (the bearer/direct-API fleet archetype,
// with the Partner API's non-standard `X-ACCESS-TOKEN` header — which is why
// this is a thin custom client rather than mcp-utils' `createApiClient`,
// whose token support only emits `Authorization: Bearer …`).
//
// Deferred-config-error pattern: the module loads and the server boots with
// no credentials; `GYG_API_KEY` is read lazily on the first request and a
// missing key surfaces as an actionable McpToolError on the first tool call,
// so the host's install-time tools/list probe always succeeds.
import {
  buildQueryString,
  formatApiError,
  loadDotenvSafely,
  McpToolError,
  readEnvVar,
} from '@chrischall/mcp-utils';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from './version.js';

// Load .env for local dev; silently skip if dotenv is unavailable (e.g. the
// mcpb bundle, which externalizes dotenv). override:false + quiet:true.
const __dirname = dirname(fileURLToPath(import.meta.url));
await loadDotenvSafely({ path: join(__dirname, '..', '.env') });

/** Default Partner API base URL; override with GYG_BASE_URL. */
export const DEFAULT_BASE_URL = 'https://api.getyourguide.com/1';

/** Resolve the API base URL (env override, trailing slashes stripped). */
export function resolveBaseUrl(): string {
  return (readEnvVar('GYG_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

// Per-request timeout. Overridable via GYG_REQUEST_TIMEOUT_MS. 30s fails a
// stuck upstream fast instead of burning the MCP client-side budget; the
// single 429/503 retry gets its own fresh window.
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Resolve the per-request timeout in ms (env override, hardened). */
export function requestTimeoutMs(): number {
  const raw = readEnvVar('GYG_REQUEST_TIMEOUT_MS');
  if (raw === undefined) return DEFAULT_REQUEST_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REQUEST_TIMEOUT_MS;
}

/** Ceiling on how long the single rate-limit retry will wait. */
export const RETRY_AFTER_CAP_MS = 10_000;
/** Delay used when a 429/503 carries no usable Retry-After header. */
export const DEFAULT_RETRY_DELAY_MS = 2_000;

/**
 * Turn a `Retry-After` header (seconds, per RFC 9110) into a bounded delay in
 * ms. Missing / non-numeric / negative values fall back to the default delay;
 * honest values are honored up to {@link RETRY_AFTER_CAP_MS} so a hostile or
 * misconfigured upstream can't park a tool call for minutes.
 */
export function retryDelayMs(header: string | null): number {
  if (header === null) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
}

// The Partner API REQUIRES cnt_language and currency on every documented
// endpoint (live-verified 2026-07-06: omitting either fails param validation
// with a 400 before auth is even checked), so the client always sends both —
// env defaults first, hard fallbacks last, per-call params on top.
export const FALLBACK_CURRENCY = 'USD';
export const FALLBACK_LANGUAGE = 'en';

/**
 * Resolve the content language the client would send by default. Exposed for
 * endpoints that take the hyphenated `cnt-language` grammar (e.g.
 * /tours/{id}/availability) and therefore opt out of default injection but
 * still need the same env-then-fallback resolution.
 */
export function resolveLanguage(): string {
  return readEnvVar('GYG_LANGUAGE') ?? FALLBACK_LANGUAGE;
}

/** Test seams: both default to the real global implementations. */
export interface GYGClientOptions {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Thin GET-only client for the GetYourGuide Partner API.
 *
 * All tools funnel through {@link GYGClient.get}, which attaches the
 * `X-ACCESS-TOKEN` header, injects the GYG_CURRENCY / GYG_LANGUAGE defaults,
 * retries once on 429/503 honoring Retry-After, and formats every non-2xx
 * body through the shared redact-then-truncate `formatApiError`.
 */
export class GYGClient {
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(opts: GYGClientOptions = {}) {
    this.fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
    this.sleepFn = opts.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  // Deferred config: read the key at request time so the server boots (and
  // answers tools/list) without credentials.
  private requireKey(): string {
    const key = readEnvVar('GYG_API_KEY');
    if (key === undefined) {
      throw new McpToolError(
        'GYG_API_KEY is not set — the GetYourGuide Partner API requires an API key on every request.',
        {
          hint:
            'Join the GetYourGuide partner program at https://partner.getyourguide.com, copy your API key, ' +
            'and set GYG_API_KEY in your MCP host config (or a .env file next to the server).',
        },
      );
    }
    return key;
  }

  /**
   * GET a Partner API path (e.g. `/tours`) with query params. `undefined`
   * param values are dropped; explicit per-call values win over the
   * GYG_CURRENCY / GYG_LANGUAGE env defaults, which in turn win over the
   * USD / en fallbacks (the API rejects requests missing either).
   *
   * `defaults: false` skips the currency/cnt_language injection for the
   * endpoints on the newer grammar (availability takes `cnt-language` with a
   * hyphen and no currency) — the caller then owns every param.
   */
  async get<T = unknown>(
    path: string,
    params: Record<string, unknown> = {},
    opts: { defaults?: boolean } = {},
  ): Promise<T> {
    const key = this.requireKey();
    const merged: Record<string, unknown> =
      opts.defaults === false
        ? {}
        : {
            currency: readEnvVar('GYG_CURRENCY') ?? FALLBACK_CURRENCY,
            cnt_language: resolveLanguage(),
          };
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined) merged[name] = value;
    }
    const url = `${resolveBaseUrl()}${path}${buildQueryString(merged)}`;
    const headers = {
      'X-ACCESS-TOKEN': key,
      Accept: 'application/json',
      'User-Agent': `getyourguide-mcp/${VERSION} (+https://github.com/chrischall/getyourguide-mcp)`,
    };

    let response = await this.fetchFn(url, { headers, signal: AbortSignal.timeout(requestTimeoutMs()) });
    if (response.status === 429 || response.status === 503) {
      // One bounded retry honoring Retry-After — enough for a transient
      // rate-limit blip without turning a hard limit into a hang.
      await this.sleepFn(retryDelayMs(response.headers.get('retry-after')));
      response = await this.fetchFn(url, { headers, signal: AbortSignal.timeout(requestTimeoutMs()) });
    }
    return this.parseResponse<T>(response, path);
  }

  private async parseResponse<T>(response: Response, path: string): Promise<T> {
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new McpToolError(formatApiError(response.status, 'GET', path, body, { service: 'GetYourGuide' }), {
        hint:
          'The API key was rejected. Either GYG_API_KEY is wrong, or the key does not have access to this ' +
          'endpoint (some Partner API endpoints are gated by partner tier). Check the key in your partner dashboard.',
      });
    }
    if (response.status === 429 || response.status === 503) {
      throw new McpToolError(formatApiError(response.status, 'GET', path, body, { service: 'GetYourGuide' }), {
        hint: 'Rate limited even after one retry — wait a minute before trying again, and space out bulk lookups.',
      });
    }
    if (!response.ok) {
      throw new McpToolError(formatApiError(response.status, 'GET', path, body, { service: 'GetYourGuide' }));
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new McpToolError(`GetYourGuide returned a non-JSON response for GET ${path} (status ${response.status}).`, {
        hint:
          'This usually means a proxy or interstitial page answered instead of the API. ' +
          'Check GYG_BASE_URL and your network, then retry.',
      });
    }
  }
}

/**
 * The shared client instance handed to every tool registrar via runMcp deps.
 * Constructed at module load — credential checks stay deferred to request time.
 */
export const client = new GYGClient();
