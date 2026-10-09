// GetYourGuide Partner API client (the bearer/direct-API fleet archetype). The
// Partner API authenticates with a non-standard `X-ACCESS-TOKEN` header, so the
// shared `createApiClient` is configured with `tokenHeader: 'X-ACCESS-TOKEN'`
// (it sends the raw token in that named header — the `Bearer` default is only
// one of its modes). The transport concerns — per-request timeout, the single
// 429/503 retry honoring a capped Retry-After, and redact-then-truncate error
// formatting — are all `createApiClient`'s; this wrapper keeps only the
// GYG-specific glue: the deferred `GYG_API_KEY` config error, the
// currency/cnt_language default injection, and the actionable hints the tools
// surface on auth / rate-limit / non-JSON failures.
//
// Deferred-config-error pattern: the module loads and the server boots with
// no credentials; `GYG_API_KEY` is read lazily on the first request and a
// missing key surfaces as an actionable McpToolError on the first tool call,
// so the host's install-time tools/list probe always succeeds.
import {
  ApiError,
  createApiClient,
  EdgeBlockedError,
  formatApiError,
  loadDotenvSafely,
  McpToolError,
  readEnvVar,
  RequestTimeoutError,
  UpstreamFormatError,
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

/** Ceiling on how long the single rate-limit retry will wait (caps Retry-After). */
export const RETRY_AFTER_CAP_MS = 10_000;
/** Delay used when a 429/503 carries no usable Retry-After header. */
export const DEFAULT_RETRY_DELAY_MS = 2_000;

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

/** Hint shown when the API key is rejected (401/403). */
const AUTH_HINT =
  'The API key was rejected. Either GYG_API_KEY is wrong, or the key does not have access to this ' +
  'endpoint (some Partner API endpoints are gated by partner tier). Check the key in your partner dashboard.';
/** Hint shown when a 429/503 persists after the single retry. */
const RATE_LIMIT_HINT = 'Rate limited even after one retry — wait a minute before trying again, and space out bulk lookups.';
/** Hint shown when a 2xx body isn't JSON (proxy/interstitial answered). */
const NON_JSON_HINT =
  'This usually means a proxy or interstitial page answered instead of the API. ' +
  'Check GYG_BASE_URL and your network, then retry.';

/**
 * An {@link McpToolError} that carries the upstream HTTP status. The
 * healthcheck classifier (and mcp-utils' shared ladder) read `status`, never
 * status-like digits in the message — that message embeds the upstream body,
 * which can quote any number.
 */
export class GYGHttpError extends McpToolError {
  readonly status: number;
  constructor(message: string, status: number, hint?: string) {
    super(message, { hint });
    this.status = status;
  }
}

/** Hint shown when a request exceeds GYG_REQUEST_TIMEOUT_MS. */
const TIMEOUT_HINT =
  'GetYourGuide did not answer in time. Retry; if it keeps happening, raise GYG_REQUEST_TIMEOUT_MS ' +
  '(default 30000 ms) or check GYG_BASE_URL and your network.';
/** Hint shown when the request never got an HTTP answer (DNS, refused, reset). */
const NETWORK_HINT =
  'The request never reached GetYourGuide. Check your network connection and GYG_BASE_URL ' +
  '(default https://api.getyourguide.com/1), then retry.';

/** Test seams: both default to the real global implementations. */
export interface GYGClientOptions {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Thin GET-only client for the GetYourGuide Partner API.
 *
 * All tools funnel through {@link GYGClient.get}, which attaches the
 * `X-ACCESS-TOKEN` header (via `createApiClient`'s `tokenHeader`), injects the
 * GYG_CURRENCY / GYG_LANGUAGE defaults, retries once on 429/503 honoring a
 * capped Retry-After, and maps every failure onto an actionable
 * {@link McpToolError} (`createApiClient` handles the redact-then-truncate
 * `formatApiError` body formatting under the hood).
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

  // Build a per-request bearer client. Constructed per call so GYG_BASE_URL /
  // GYG_REQUEST_TIMEOUT_MS env overrides are read at request time, and so the
  // 401/429 error factories can close over `path` (createApiClient passes them
  // no context) to reproduce the `... for GET <path>` message shape.
  private apiFor(path: string): ReturnType<typeof createApiClient> {
    return createApiClient({
      baseUrl: resolveBaseUrl(),
      getToken: () => this.requireKey(),
      tokenHeader: 'X-ACCESS-TOKEN',
      serviceName: 'GetYourGuide',
      baseHeaders: {
        'User-Agent': `getyourguide-mcp/${VERSION} (+https://github.com/chrischall/getyourguide-mcp)`,
      },
      timeout: requestTimeoutMs(),
      retry: {
        count: 1,
        delayMs: DEFAULT_RETRY_DELAY_MS,
        statuses: [429, 503],
        honorRetryAfter: true,
        maxRetryAfterMs: RETRY_AFTER_CAP_MS,
      },
      onUnauthorized: () =>
        new GYGHttpError(formatApiError(401, 'GET', path, '', { service: 'GetYourGuide' }), 401, AUTH_HINT),
      onRateLimited: () =>
        new GYGHttpError(formatApiError(429, 'GET', path, '', { service: 'GetYourGuide' }), 429, RATE_LIMIT_HINT),
      fetchImpl: this.fetchFn,
      sleep: this.sleepFn,
    });
  }

  /**
   * GET a Partner API path (e.g. `/tours`) with query params. `undefined`
   * and empty-string param values are dropped (so `currency: ''` from a tool
   * call falls back to the default instead of erasing a required param); explicit per-call values win over the
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
    const merged: Record<string, unknown> =
      opts.defaults === false
        ? {}
        : {
            currency: readEnvVar('GYG_CURRENCY') ?? FALLBACK_CURRENCY,
            cnt_language: resolveLanguage(),
          };
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') merged[name] = value;
    }

    try {
      return await this.apiFor(path).fetchJson<T>('GET', path, { query: merged });
    } catch (err) {
      // A 2xx body that isn't JSON: since mcp-utils 3.0 fetchJson throws
      // UpstreamFormatError (an McpToolError) with a generic hint. Re-wrap it
      // with the GYG-specific message and hint before the pass-through below.
      if (err instanceof UpstreamFormatError) {
        throw new McpToolError(`GetYourGuide returned a non-JSON response for GET ${path}.`, {
          hint: NON_JSON_HINT,
          cause: err,
        });
      }
      // 401/429 already arrive as actionable McpToolErrors from the factories
      // above; requireKey's deferred-config error does too. Pass them through.
      if (err instanceof McpToolError) throw err;
      // A CDN/WAF refusal page (mcp-utils 2.9) is not GetYourGuide's answer:
      // pass it through rather than dressing its 403 in the bad-key hint.
      if (err instanceof EdgeBlockedError) throw err;
      // Every other non-2xx surfaces as a status-carrying ApiError whose message
      // is the redacted `formatApiError` string. Re-wrap it with the matching
      // hint: 403 shares the auth hint, a persisting 503 the rate-limit hint.
      if (err instanceof ApiError) {
        if (err.status === 403) throw new GYGHttpError(err.message, 403, AUTH_HINT);
        if (err.status === 503) throw new GYGHttpError(err.message, 503, RATE_LIMIT_HINT);
        throw new GYGHttpError(err.message, err.status);
      }
      // A caller cancellation is not a GetYourGuide failure — leave it as the
      // AbortError the MCP runtime recognises.
      if (err instanceof Error && err.name === 'AbortError') throw err;
      // Timeouts and network failures (DNS, refused, reset) get the same
      // path-naming, actionable shape as every HTTP failure. The original text
      // stays in the message ("timed out", "fetch failed") so the shared
      // healthcheck ladder still tells timeout from transport.
      const detail = err instanceof Error ? err.message : String(err);
      throw new McpToolError(`GetYourGuide request failed for GET ${path}: ${detail}`, {
        hint: err instanceof RequestTimeoutError ? TIMEOUT_HINT : NETWORK_HINT,
        cause: err,
      });
    }
  }
}

/**
 * The shared client instance handed to every tool registrar via runMcp deps.
 * Constructed at module load — credential checks stay deferred to request time.
 */
export const client = new GYGClient();
