/**
 * Base error class for all AuthCord SDK errors.
 */
export class AuthCordError extends Error {
  /** HTTP status code that triggered the error, or 0 if not applicable. */
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 0) {
    super(message);
    this.name = 'AuthCordError';
    this.statusCode = statusCode;
  }
}

/**
 * Raised when API key authentication fails (HTTP 401).
 */
export class AuthenticationError extends AuthCordError {
  constructor(message: string = 'Invalid API key') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Raised when the API rate limit is exceeded (HTTP 429).
 */
export class RateLimitError extends AuthCordError {
  /** Seconds to wait before retrying, if the server provided a Retry-After header. */
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Raised when the API returns a non-success status code.
 */
export class ApiError extends AuthCordError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
    this.name = 'ApiError';
  }
}

/**
 * Raised when offline token operations fail (invalid format, expired, bad signature).
 */
export class OfflineTokenError extends AuthCordError {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineTokenError';
  }
}
