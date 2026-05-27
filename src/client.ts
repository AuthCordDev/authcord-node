import { createPublicKey, verify } from 'node:crypto';
import {
  AuthCordError,
  AuthenticationError,
  RateLimitError,
  ApiError,
  OfflineTokenError,
} from './errors.js';
import type {
  ValidationResult,
  SessionCreateResult,
  OfflineTokenResult,
  PublicKeyResult,
  Session,
  ValidateOptions,
  CreateSessionOptions,
  ValidateSessionOptions,
  HeartbeatResult,
  HeartbeatOptions,
  StartHeartbeatOptions,
  HeartbeatHandle,
  HwidComponents,
} from './types.js';

/**
 * Best-effort collector for spoofer-resistant HWID components.
 *
 * On Windows: populates `sid` via `whoami /user`, `cpu_id` via `wmic
 * cpu get ProcessorId`, and `machine_guid` from the registry. Returns
 * an empty object on other platforms — cross-platform callers should
 * fill the struct themselves.
 *
 * Pass the returned object as `hwid_components` to `client.validate({...})`
 * (and `client.startHeartbeat({...})`) when your app's HWID Strategy is
 * `STABLE` or `STRICT`. Backwards-compat: still send your legacy `hwid`
 * string alongside so users on apps still on `LEGACY` keep working.
 */
export async function collectHwidComponents(): Promise<HwidComponents> {
  const out: HwidComponents = {};
  if (process.platform !== 'win32') return out;

  // Avoid hard-importing child_process at module top-level so consumers
  // bundling for the browser don't trip over it. `await import()` is fine
  // in Node ESM and gets tree-shaken otherwise.
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  // ── Windows User SID ──
  try {
    const { stdout } = await run('whoami', ['/user', '/fo', 'csv', '/nh'], { timeout: 5000 });
    const match = stdout.match(/S-1-5-[\d-]+/);
    if (match) out.sid = match[0];
  } catch { /* ignore */ }

  // ── CPU ID ──
  try {
    const { stdout } = await run('wmic', ['cpu', 'get', 'ProcessorId', '/value'], { timeout: 5000 });
    const line = stdout.split(/\r?\n/).find(l => l.trim().startsWith('ProcessorId='));
    const val = line?.split('=', 2)[1]?.trim();
    if (val) out.cpu_id = val;
  } catch { /* ignore */ }

  // ── MachineGuid ──
  try {
    const { stdout } = await run(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { timeout: 5000 },
    );
    // Output: "    MachineGuid    REG_SZ    xxxxx-xxxx-..."
    const match = stdout.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/);
    if (match) out.machine_guid = match[1];
  } catch { /* ignore */ }

  return out;
}

/**
 * Client options.
 */
export interface AuthCordClientOptions {
  /** Base URL for the AuthCord API. Defaults to "https://authcord.dev". */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000 (30s). */
  timeout?: number;
}

/**
 * Official AuthCord Node.js SDK client.
 *
 * @example
 * ```ts
 * import { AuthCordClient } from '@authcord/sdk';
 *
 * const client = new AuthCordClient('dax_your_api_key');
 * const result = await client.validate({ app_id: 'abc', discord_id: '123' });
 * if (result.valid) {
 *   console.log(`Welcome ${result.user?.username}!`);
 * }
 * ```
 */
export class AuthCordClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(apiKey: string, options?: AuthCordClientOptions) {
    if (!apiKey) {
      throw new AuthCordError('API key is required.');
    }
    this.apiKey = apiKey;
    this.baseUrl = (options?.baseUrl ?? 'https://authcord.dev').replace(/\/+$/, '');
    this.timeout = options?.timeout ?? 30_000;
  }

  /**
   * Validate a user's access to your application.
   *
   * At least one of `discord_id`, `user_id`, or `email` must be provided.
   */
  async validate(options: ValidateOptions): Promise<ValidationResult> {
    if (!options.discord_id && !options.user_id && !options.email) {
      throw new AuthCordError('At least one of discord_id, user_id, or email is required.');
    }
    const body: Record<string, unknown> = {
      app_id: options.app_id,
    };
    if (options.discord_id !== undefined) body.discord_id = options.discord_id;
    if (options.user_id !== undefined) body.user_id = options.user_id;
    if (options.email !== undefined) body.email = options.email;
    if (options.product_id !== undefined) body.product_id = options.product_id;
    if (options.hwid !== undefined) body.hwid = options.hwid;
    if (options.hwid_components) {
      const comp: Record<string, string> = {};
      for (const [k, v] of Object.entries(options.hwid_components)) {
        if (typeof v === 'string' && v.length > 0) comp[k] = v;
      }
      if (Object.keys(comp).length > 0) body.hwid_components = comp;
    }
    if (options.ip !== undefined) body.ip = options.ip;
    if (options.user_agent !== undefined) body.user_agent = options.user_agent;
    if (options.device_meta !== undefined) body.device_meta = options.device_meta;
    if (options.binary_hash !== undefined) body.binary_hash = options.binary_hash;
    if (options.app_version !== undefined) body.app_version = options.app_version;

    return this.request<ValidationResult>('POST', '/api/v1/auth/validate', body);
  }

  /**
   * Create a persistent device session.
   *
   * At least one of `discord_id`, `user_id`, or `email` must be provided.
   */
  async createSession(options: CreateSessionOptions): Promise<SessionCreateResult> {
    if (!options.discord_id && !options.user_id && !options.email) {
      throw new AuthCordError('At least one of discord_id, user_id, or email is required.');
    }
    const body: Record<string, unknown> = {
      app_id: options.app_id,
      hwid: options.hwid,
    };
    if (options.discord_id !== undefined) body.discord_id = options.discord_id;
    if (options.user_id !== undefined) body.user_id = options.user_id;
    if (options.email !== undefined) body.email = options.email;
    if (options.device_name !== undefined) body.device_name = options.device_name;
    if (options.device_meta !== undefined) body.device_meta = options.device_meta;

    return this.request<SessionCreateResult>('POST', '/api/v1/auth/sessions/create', body);
  }

  /**
   * Validate using a session token.
   */
  async validateSession(options: ValidateSessionOptions): Promise<ValidationResult> {
    const body: Record<string, unknown> = {
      session_token: options.session_token,
      hwid: options.hwid,
    };
    if (options.product_id !== undefined) body.product_id = options.product_id;
    if (options.device_meta !== undefined) body.device_meta = options.device_meta;
    if (options.binary_hash !== undefined) body.binary_hash = options.binary_hash;
    if (options.app_version !== undefined) body.app_version = options.app_version;

    return this.request<ValidationResult>('POST', '/api/v1/auth/sessions/validate', body);
  }

  /**
   * Single heartbeat check — returns whether the user's session is still
   * live. Pass `session_token` (DeviceSession flow) OR both `discord_id`
   * and `hwid` (validate-only flow). Cheap and rate-limited to ~2/sec/IP
   * on the server side, intended to be called every few seconds from
   * your app's main loop.
   */
  async heartbeat(options: HeartbeatOptions): Promise<HeartbeatResult> {
    const hasHwidSignal = !!options.hwid || !!(options.hwid_components && Object.values(options.hwid_components).some(v => typeof v === 'string' && v.length > 0));
    if (!options.session_token && !(options.discord_id && hasHwidSignal)) {
      throw new Error('Provide session_token, or discord_id with hwid or hwid_components');
    }
    const body: Record<string, unknown> = { app_id: options.app_id };
    if (options.session_token) body.session_token = options.session_token;
    if (options.discord_id) body.discord_id = options.discord_id;
    if (options.hwid) body.hwid = options.hwid;
    if (options.hwid_components) {
      const comp: Record<string, string> = {};
      for (const [k, v] of Object.entries(options.hwid_components)) {
        if (typeof v === 'string' && v.length > 0) comp[k] = v;
      }
      if (Object.keys(comp).length > 0) body.hwid_components = comp;
    }
    const result = await this.request<HeartbeatResult>(
      'POST',
      '/api/v1/auth/heartbeat',
      body,
    );
    return {
      valid: !!result.valid,
      reason: result.reason,
      next_heartbeat_in: Number(result.next_heartbeat_in ?? 10),
    };
  }

  /**
   * Start a background heartbeat loop. Calls `onTerminated` exactly once
   * when the server returns `valid=false`, then stops. Your app should
   * use the callback to log the user out / return to the login screen.
   *
   * Returns a handle with `.stop()` to cancel the loop early (e.g. when
   * the user signs out normally).
   *
   * Network errors are passed to `onError` and the loop continues. The
   * server's `next_heartbeat_in` value controls the cadence when
   * `intervalSeconds` isn't pinned by the caller.
   */
  startHeartbeat(options: StartHeartbeatOptions): HeartbeatHandle {
    if (!options.session_token && !(options.discord_id && options.hwid)) {
      throw new Error('Provide session_token, or both discord_id and hwid');
    }
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;
    let waitSeconds = options.intervalSeconds ?? 10;

    const tick = async (): Promise<void> => {
      if (stopped) return;
      try {
        const result = await this.heartbeat({
          app_id: options.app_id,
          session_token: options.session_token,
          discord_id: options.discord_id,
          hwid: options.hwid,
        });
        if (!result.valid) {
          stopped = true;
          try { options.onTerminated(result); } catch { /* swallow user errors */ }
          return;
        }
        if (options.intervalSeconds === undefined) {
          waitSeconds = Math.max(1, result.next_heartbeat_in);
        }
      } catch (err) {
        if (options.onError) {
          try { options.onError(err); } catch { /* swallow user errors */ }
        }
      }
      if (!stopped) {
        timer = setTimeout(() => { void tick(); }, waitSeconds * 1000);
      }
    };

    timer = setTimeout(() => { void tick(); }, waitSeconds * 1000);

    return {
      stop: () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      },
      isRunning: () => !stopped,
    };
  }

  /**
   * Revoke a specific session by token.
   */
  async revokeSession(sessionToken: string): Promise<boolean> {
    const result = await this.request<{ success: boolean }>(
      'POST',
      '/api/v1/auth/sessions/revoke',
      { session_token: sessionToken },
    );
    return result.success ?? false;
  }

  /**
   * Revoke all sessions for a user in an app. Returns the count of sessions revoked.
   */
  async revokeAllSessions(discordId: string, appId: string): Promise<number> {
    const result = await this.request<{ count: number }>(
      'POST',
      '/api/v1/auth/sessions/revoke',
      { discord_id: discordId, app_id: appId },
    );
    return result.count ?? 0;
  }

  /**
   * List all sessions for a user in an app.
   */
  async listSessions(discordId: string, appId: string): Promise<Session[]> {
    const params = new URLSearchParams({ discord_id: discordId, app_id: appId });
    const result = await this.request<{ sessions: Session[] }>(
      'GET',
      `/api/v1/auth/sessions/list?${params.toString()}`,
    );
    return result.sessions ?? [];
  }

  /**
   * Generate a signed offline token.
   *
   * At least one of `discordId`, `userId`, or `email` must be provided.
   * For backwards compatibility, `discordId` is accepted as the first positional argument.
   */
  async getOfflineToken(
    discordId: string | null,
    appId: string,
    options?: { product_id?: string; hwid?: string; ttl?: number; user_id?: string; email?: string },
  ): Promise<OfflineTokenResult> {
    if (!discordId && !options?.user_id && !options?.email) {
      throw new AuthCordError('At least one of discordId, user_id, or email is required.');
    }
    const body: Record<string, unknown> = {
      app_id: appId,
    };
    if (discordId) body.discord_id = discordId;
    if (options?.user_id !== undefined) body.user_id = options.user_id;
    if (options?.email !== undefined) body.email = options.email;
    if (options?.product_id !== undefined) body.product_id = options.product_id;
    if (options?.hwid !== undefined) body.hwid = options.hwid;
    if (options?.ttl !== undefined) body.ttl = options.ttl;

    return this.request<OfflineTokenResult>('POST', '/api/v1/auth/offline-token', body);
  }

  /**
   * Get the public key for offline token verification.
   */
  async getPublicKey(appId: string): Promise<PublicKeyResult> {
    const params = new URLSearchParams({ app_id: appId });
    return this.request<PublicKeyResult>(
      'GET',
      `/api/v1/auth/offline-token/public-key?${params.toString()}`,
    );
  }

  /**
   * Verify an offline token locally (no internet required).
   *
   * Uses Ed25519 signature verification via Node.js crypto.
   */
  verifyOffline(token: string, publicKey: string, hwid?: string): ValidationResult {
    // Decode the token
    let tokenData: { payload: Record<string, unknown>; signature: string };
    try {
      const tokenBuffer = Buffer.from(token, 'base64');
      tokenData = JSON.parse(tokenBuffer.toString('utf-8'));
    } catch (e) {
      throw new OfflineTokenError(`Invalid token format: ${e}`);
    }

    if (!tokenData.payload || !tokenData.signature) {
      throw new OfflineTokenError('Invalid token format: missing payload or signature');
    }

    const { payload, signature } = tokenData;

    // Verify Ed25519 signature
    try {
      const pubKeyBytes = Buffer.from(publicKey, 'base64');
      const keyObject = createPublicKey({
        key: pubKeyBytes,
        format: 'der',
        type: 'spki',
      });

      const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf-8');
      const sigBytes = Buffer.from(signature, 'base64');

      const valid = verify(null, payloadBytes, keyObject, sigBytes);
      if (!valid) {
        throw new OfflineTokenError('Token signature verification failed');
      }
    } catch (e) {
      if (e instanceof OfflineTokenError) throw e;
      throw new OfflineTokenError(`Signature verification error: ${e}`);
    }

    // Check expiration
    const expiresAt = payload.expires_at as number | undefined;
    if (expiresAt && Date.now() / 1000 > expiresAt) {
      throw new OfflineTokenError('Token has expired');
    }

    // Validate HWID
    const tokenHwid = payload.hwid as string | undefined;
    if (hwid && tokenHwid && hwid !== tokenHwid) {
      return {
        valid: false,
        reason: 'Hardware ID mismatch',
        hwid_mismatch: true,
      };
    }

    // Build result
    const productIds = (payload.product_ids as string[]) ?? [];
    return {
      valid: true,
      user: {
        discord_id: payload.discord_id as string,
        username: (payload.username as string) ?? 'Unknown',
      },
      products: productIds.map((pid) => ({
        id: pid,
        name: '',
        expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
        is_lifetime: expiresAt === undefined,
        stream_only: false,
      })),
    };
  }

  /**
   * Sends an HTTP request, deserializes the response, and handles errors.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Accept': 'application/json',
      'User-Agent': 'AuthCord-Node-SDK/1.0.0',
    };

    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new AuthCordError('Request timed out.');
      }
      throw new AuthCordError(`Network error: ${err}`);
    } finally {
      clearTimeout(timer);
    }

    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message ?? errorData.error ?? errorMessage;
      } catch {
        // Use default error message
      }

      switch (response.status) {
        case 401:
          throw new AuthenticationError(errorMessage);
        case 429: {
          const retryHeader = response.headers.get('Retry-After');
          const retryAfter = retryHeader ? parseInt(retryHeader, 10) : undefined;
          throw new RateLimitError(
            errorMessage,
            Number.isNaN(retryAfter) ? undefined : retryAfter,
          );
        }
        default:
          throw new ApiError(errorMessage, response.status);
      }
    }

    try {
      return JSON.parse(responseText) as T;
    } catch {
      throw new AuthCordError(`Failed to parse response: ${responseText}`);
    }
  }
}
