export { AuthCordClient, collectHwidComponents } from './client.js';
export type { AuthCordClientOptions } from './client.js';

export {
  AuthCordError,
  AuthenticationError,
  RateLimitError,
  ApiError,
  OfflineTokenError,
} from './errors.js';

export type {
  ValidationResult,
  UserInfo,
  ProductInfo,
  HwidResult,
  FileInfo,
  SessionInfo,
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
