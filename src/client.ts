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
} from './types.js';

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
