/**
 * Basic user information returned from validation.
 */
export interface UserInfo {
  discord_id: string;
  username: string;
}

/**
 * Product access information.
 */
export interface ProductInfo {
  id: string;
  name: string;
  expires_at: string | null;
  is_lifetime: boolean;
  hwid_status?: string;
}

/**
 * Per-product HWID status.
 */
export interface HwidResult {
  productId: string;
  productName: string;
  hwidStatus: string;
}

/**
 * Downloadable file information.
 */
export interface FileInfo {
  id: string;
  name: string;
  filename: string;
  size: number;
  description?: string;
  version?: string;
  checksum?: string;
  stream_only: boolean;
}

/**
 * Device session context returned from session validation.
 */
export interface SessionInfo {
  device_name?: string;
  first_seen?: string;
  last_seen?: string;
  ip?: string;
  user_agent?: string;
}

/**
 * Result of a user validation request.
 */
export interface ValidationResult {
  valid: boolean;
  mode?: string;
  user?: UserInfo;
  products?: ProductInfo[];
  hwid_results?: HwidResult[];
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
  entitlements?: Record<string, unknown>;
  files?: FileInfo[];
  session_info?: SessionInfo;
  reason?: string;
  banned?: boolean;
  hwid_mismatch?: boolean;
}

/**
 * Result of creating a new session.
 */
export interface SessionCreateResult {
  success: boolean;
  session_token: string;
  expires_at: string;
  device_name?: string;
}

/**
 * Signed offline token result.
 */
export interface OfflineTokenResult {
  token: string;
  payload: Record<string, unknown>;
  expires_at: string;
}

/**
 * Public key for offline token verification.
 */
export interface PublicKeyResult {
  public_key: string;
  algorithm: string;
}

/**
 * A device session entry.
 */
export interface Session {
  id: string;
  hwid: string;
  device_name?: string;
  ip?: string;
  last_used_at: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string;
  is_active: boolean;
}

/**
 * Options for the validate method.
 *
 * At least one of `discord_id`, `user_id`, or `email` must be provided.
 */
export interface ValidateOptions {
  discord_id?: string;
  user_id?: string;
  email?: string;
  app_id: string;
  product_id?: string;
  hwid?: string;
  hwid_components?: HwidComponents;
  ip?: string;
  user_agent?: string;
  device_meta?: Record<string, unknown>;
  binary_hash?: string;
  app_version?: string;
}

/**
 * Options for the createSession method.
 *
 * At least one of `discord_id`, `user_id`, or `email` must be provided.
 */
export interface CreateSessionOptions {
  discord_id?: string;
  user_id?: string;
  email?: string;
  app_id: string;
  hwid: string;
  device_name?: string;
  device_meta?: Record<string, unknown>;
}

/**
 * Options for the validateSession method.
 */
export interface ValidateSessionOptions {
  session_token: string;
  hwid: string;
  product_id?: string;
  device_meta?: Record<string, unknown>;
  binary_hash?: string;
  app_version?: string;
}

/**
 * Structured HWID components. The server hashes a subset of these
 * (determined by the app's HWID Strategy in the dashboard) to derive
 * the canonical HWID used for slot matching.
 *
 * Typical temp HWID spoofers (used to evade FiveM-style server bans)
 * change SMBIOS UUID, disk serial, MAC, and MachineGuid — but NOT
 * the Windows User SID or CPUID. Apps using `STABLE` hash only
 * (sid + cpu_id) so users stay bound across spoofs.
 *
 * On Windows, call `collectHwidComponents()` to populate
 * `sid` + `cpu_id` + `machine_guid` automatically. Otherwise fill
 * the fields yourself.
 */
export interface HwidComponents {
  sid?: string;
  cpu_id?: string;
  machine_guid?: string;
  mac?: string;
  disk?: string;
}

/**
 * Result of a heartbeat check. `valid=false` means the session has been
 * terminated by an admin, the user has been banned/paused, the product
 * expired, or the HWID was unbound. `reason` carries the machine-readable
 * code (e.g. "terminated", "banned", "expired", "hwid_unbound") so the
 * client can branch on it.
 */
export interface HeartbeatResult {
  valid: boolean;
  reason?: string;
  /** Server-suggested seconds until the next heartbeat. Default 10. */
  next_heartbeat_in: number;
}

/**
 * Options for a single heartbeat() call. Pass either `session_token` or
 * both `discord_id` and `hwid`.
 */
export interface HeartbeatOptions {
  app_id: string;
  session_token?: string;
  discord_id?: string;
  hwid?: string;
  hwid_components?: HwidComponents;
}

/**
 * Options for startHeartbeat(). Extends HeartbeatOptions with the
 * callback for termination and an optional fixed interval.
 */
export interface StartHeartbeatOptions extends HeartbeatOptions {
  onTerminated: (result: HeartbeatResult) => void;
  onError?: (err: unknown) => void;
  /** Fixed seconds between polls. When omitted, honours server-suggested next_heartbeat_in. */
  intervalSeconds?: number;
}

/**
 * Handle returned from startHeartbeat(). Call .stop() to cancel the loop.
 */
export interface HeartbeatHandle {
  stop: () => void;
  isRunning: () => boolean;
}
