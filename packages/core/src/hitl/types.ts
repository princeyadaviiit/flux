/**
 * Flux Human-In-The-Loop (HITL) Types
 * Specifications: TRD §4.4, RULES.md §1.3, §1.4
 */

export interface ApprovalToken {
  /** Caller-supplied unique identifier for the pending action */
  actionId: string;
  /** Bound session identifier */
  sessionId: string;
  /** Server-issued single-use cryptographic nonce */
  nonce: string;
  /** Timestamp in ms epoch when issued */
  issuedAt: number;
  /** Timestamp in ms epoch when expires */
  expiresAt: number;
  /** HMAC-SHA256 signature */
  sig: string;
}

export interface ApprovalRequest {
  /** Unique action ID */
  actionId: string;
  /** Human-readable explanation shown in Approval UI */
  summary: string;
  /** Optional structured payload for custom Approval UI */
  payload?: unknown;
  /** TTL in milliseconds (default: 120_000 = 2 minutes) */
  ttlMs?: number;
}

export interface ApprovalResult {
  /** Whether the sensitive action was approved */
  approved: boolean;
  /** The action identifier */
  actionId: string;
  /** Optional reason if rejected or failed */
  reason?: string;
  /** Verified token if approved */
  token?: ApprovalToken;
}

export interface TokenVerificationResult {
  valid: boolean;
  reason?: string;
}

export interface NonceStore {
  has(nonce: string): Promise<boolean> | boolean;
  add(nonce: string): Promise<void> | void;
}
