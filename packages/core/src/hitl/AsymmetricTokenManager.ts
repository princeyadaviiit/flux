/**
 * AsymmetricTokenManager (HITL v2)
 * Asymmetric cryptographic token signing and verification using ECDSA (P-256 / SHA-256).
 * Specifications: TRD §4.4, §7, §8, RULES.md §1.4
 */

import * as crypto from 'crypto';
import { ApprovalToken, TokenVerificationResult, NonceStore } from './types';
import { MemoryNonceStore } from './ApprovalTokenManager';

export interface AsymmetricTokenManagerOptions {
  /** Private key for signing tokens (PEM format) */
  privateKey?: string;
  /** Public key for verifying tokens (PEM format) */
  publicKey?: string;
  /** Custom nonce store for distributed tracking */
  nonceStore?: NonceStore;
  /** Default token TTL in milliseconds (default: 120,000ms = 2 mins) */
  defaultTtlMs?: number;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export class AsymmetricTokenManager {
  private privateKey?: string;
  private publicKey?: string;
  private nonceStore: NonceStore;
  private defaultTtlMs: number;

  constructor(options: AsymmetricTokenManagerOptions = {}) {
    this.privateKey = options.privateKey;
    this.publicKey = options.publicKey;
    this.nonceStore = options.nonceStore || new MemoryNonceStore();
    this.defaultTtlMs = options.defaultTtlMs || 120000;
  }

  /**
   * Generate an ECDSA (P-256) keypair for asymmetric token signing
   */
  public static generateKeyPair(): KeyPair {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return { publicKey, privateKey };
  }

  /**
   * Set or rotate the public verification key
   */
  public setPublicKey(publicKey: string): void {
    this.publicKey = publicKey;
  }

  /**
   * Set or rotate the private signing key
   */
  public setPrivateKey(privateKey: string): void {
    this.privateKey = privateKey;
  }

  /**
   * Create an asymmetrically signed approval token
   */
  public createToken(
    actionId: string,
    sessionId: string,
    ttlMs?: number,
    privateKey?: string
  ): ApprovalToken {
    const signingKey = privateKey || this.privateKey;
    if (!signingKey) {
      throw new Error('Private key is required to sign asymmetric approval tokens');
    }

    const nonce = crypto.randomBytes(32).toString('hex');
    const issuedAt = Date.now();
    const expiresAt = issuedAt + (ttlMs || this.defaultTtlMs);

    const message = this.canonicalize({
      actionId,
      sessionId,
      nonce,
      issuedAt,
      expiresAt,
    });

    const sign = crypto.createSign('SHA256');
    sign.update(message);
    sign.end();
    const sig = sign.sign(signingKey, 'hex');

    return {
      actionId,
      sessionId,
      nonce,
      issuedAt,
      expiresAt,
      sig,
    };
  }

  /**
   * Verify an asymmetrically signed approval token with instant nonce burning (RULES.md §1.4)
   */
  public async verifyToken(
    token: ApprovalToken,
    options: { publicKey?: string; currentTime?: number } = {}
  ): Promise<TokenVerificationResult> {
    const verificationKey = options.publicKey || this.publicKey;
    const now = options.currentTime ?? Date.now();

    // 1. Invalidate nonce immediately on ALL verification attempts to defeat replay attacks
    if (!token.nonce || typeof token.nonce !== 'string') {
      return { valid: false, reason: 'Invalid or missing nonce' };
    }

    const isUsed = await this.nonceStore.has(token.nonce);
    if (isUsed) {
      return { valid: false, reason: 'Token nonce has already been consumed (replay attempt)' };
    }

    // Burn nonce immediately
    await this.nonceStore.add(token.nonce);

    // 2. Validate TTL expiration
    if (now > token.expiresAt) {
      return { valid: false, reason: 'Token has expired' };
    }

    if (now < token.issuedAt - 5000) {
      return { valid: false, reason: 'Token creation timestamp is in the future' };
    }

    // 3. Verify cryptographic signature
    if (!verificationKey) {
      return { valid: false, reason: 'Public verification key is not configured' };
    }

    try {
      const message = this.canonicalize({
        actionId: token.actionId,
        sessionId: token.sessionId,
        nonce: token.nonce,
        issuedAt: token.issuedAt,
        expiresAt: token.expiresAt,
      });

      const verify = crypto.createVerify('SHA256');
      verify.update(message);
      verify.end();

      const isValid = verify.verify(verificationKey, token.sig, 'hex');
      if (!isValid) {
        return { valid: false, reason: 'Invalid asymmetric signature (tampered payload or wrong key)' };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: `Signature verification error: ${err.message}` };
    }
  }

  /**
   * Synchronous verification helper for convenience when in-memory nonce store is used
   */
  public verifyTokenSync(
    token: ApprovalToken,
    options: { publicKey?: string; currentTime?: number } = {}
  ): TokenVerificationResult {
    const verificationKey = options.publicKey || this.publicKey;
    const now = options.currentTime ?? Date.now();

    if (!token.nonce || typeof token.nonce !== 'string') {
      return { valid: false, reason: 'Invalid or missing nonce' };
    }

    const isUsed = (this.nonceStore as any).has(token.nonce);
    if (isUsed === true) {
      return { valid: false, reason: 'Token nonce has already been consumed (replay attempt)' };
    }

    (this.nonceStore as any).add(token.nonce);

    if (now > token.expiresAt) {
      return { valid: false, reason: 'Token has expired' };
    }

    if (now < token.issuedAt - 5000) {
      return { valid: false, reason: 'Token creation timestamp is in the future' };
    }

    if (!verificationKey) {
      return { valid: false, reason: 'Public verification key is not configured' };
    }

    try {
      const message = this.canonicalize({
        actionId: token.actionId,
        sessionId: token.sessionId,
        nonce: token.nonce,
        issuedAt: token.issuedAt,
        expiresAt: token.expiresAt,
      });

      const verify = crypto.createVerify('SHA256');
      verify.update(message);
      verify.end();

      const isValid = verify.verify(verificationKey, token.sig, 'hex');
      if (!isValid) {
        return { valid: false, reason: 'Invalid asymmetric signature (tampered payload or wrong key)' };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: `Signature verification error: ${err.message}` };
    }
  }

  /**
   * Canonicalize token fields to ensure deterministic message reconstruction
   */
  private canonicalize(payload: {
    actionId: string;
    sessionId: string;
    nonce: string;
    issuedAt: number;
    expiresAt: number;
  }): string {
    return JSON.stringify({
      actionId: payload.actionId,
      sessionId: payload.sessionId,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    });
  }
}
