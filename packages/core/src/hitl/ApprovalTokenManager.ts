/**
 * ApprovalTokenManager
 * Issues and validates single-use HMAC-SHA256 tokens with replay prevention.
 * Specifications: TRD §4.4, RULES.md §1.4
 */

import crypto from 'crypto';
import { ApprovalToken, TokenVerificationResult, NonceStore } from './types';

export interface ApprovalTokenManagerOptions {
  sessionSecret: string;
  nonceStore?: NonceStore;
  defaultTtlMs?: number;
}

export class MemoryNonceStore implements NonceStore {
  private nonces: Set<string> = new Set();

  public has(nonce: string): boolean {
    return this.nonces.has(nonce);
  }

  public add(nonce: string): void {
    this.nonces.add(nonce);
  }

  public clear(): void {
    this.nonces.clear();
  }
}

export class ApprovalTokenManager {
  private sessionSecret: string;
  private nonceStore: NonceStore;
  private defaultTtlMs: number;

  constructor(options: ApprovalTokenManagerOptions | string) {
    if (typeof options === 'string') {
      this.sessionSecret = options;
      this.nonceStore = new MemoryNonceStore();
      this.defaultTtlMs = 120_000;
    } else {
      this.sessionSecret = options.sessionSecret;
      this.nonceStore = options.nonceStore || new MemoryNonceStore();
      this.defaultTtlMs = options.defaultTtlMs || 120_000;
    }

    if (!this.sessionSecret) {
      throw new Error('ApprovalTokenManager requires a valid sessionSecret');
    }
  }

  /**
   * Create and sign a new approval token
   */
  public createToken(actionId: string, sessionId: string, ttlMs?: number): ApprovalToken {
    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = Date.now();
    const expiresAt = issuedAt + (ttlMs ?? this.defaultTtlMs);

    const token: ApprovalToken = {
      actionId,
      sessionId,
      nonce,
      issuedAt,
      expiresAt,
      sig: '',
    };

    token.sig = this.signToken(token);
    return token;
  }

  /**
   * Verify an incoming approval token.
   * CRITICAL (RULES.md §1.4): Invalidate nonce immediately on verification attempt (success or failure)
   */
  public async verifyToken(token: ApprovalToken): Promise<TokenVerificationResult> {
    // 1. Structure check
    if (
      !token ||
      !token.actionId ||
      !token.sessionId ||
      !token.nonce ||
      !token.sig ||
      !token.issuedAt ||
      !token.expiresAt
    ) {
      return { valid: false, reason: 'Malformed approval token structure' };
    }

    const nonce = token.nonce;

    // Check if nonce was already burned (replay attack)
    const isUsed = await this.nonceStore.has(nonce);
    if (isUsed) {
      return { valid: false, reason: 'Token already used (replay attack detected)' };
    }

    // IMMEDIATELY BURN NONCE on first verification attempt (RULES.md §1.4)
    await this.nonceStore.add(nonce);

    // 2. Signature verification
    const expectedSig = this.signToken(token);
    if (token.sig !== expectedSig) {
      return { valid: false, reason: 'Invalid token signature (tampering detected)' };
    }

    // 3. Expiration / TTL check
    if (Date.now() > token.expiresAt) {
      return { valid: false, reason: 'Token has expired' };
    }

    return { valid: true };
  }

  /**
   * Synchronous verify helper (for in-memory nonce store)
   */
  public verifyTokenSync(token: ApprovalToken): TokenVerificationResult {
    if (
      !token ||
      !token.actionId ||
      !token.sessionId ||
      !token.nonce ||
      !token.sig ||
      !token.issuedAt ||
      !token.expiresAt
    ) {
      return { valid: false, reason: 'Malformed approval token structure' };
    }

    const nonce = token.nonce;

    if (this.nonceStore.has(nonce)) {
      return { valid: false, reason: 'Token already used (replay attack detected)' };
    }

    // Burn nonce immediately
    this.nonceStore.add(nonce);

    const expectedSig = this.signToken(token);
    if (token.sig !== expectedSig) {
      return { valid: false, reason: 'Invalid token signature (tampering detected)' };
    }

    if (Date.now() > token.expiresAt) {
      return { valid: false, reason: 'Token has expired' };
    }

    return { valid: true };
  }

  /**
   * Compute HMAC-SHA256 signature for token payload
   */
  public signToken(token: Omit<ApprovalToken, 'sig'>): string {
    const payload = `${token.actionId}.${token.sessionId}.${token.nonce}.${token.issuedAt}.${token.expiresAt}`;
    return crypto
      .createHmac('sha256', this.sessionSecret)
      .update(payload)
      .digest('hex');
  }
}
