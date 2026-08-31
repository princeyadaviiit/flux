/**
 * ApprovalTokenManager Unit Tests
 * Validates cryptographic security, replay prevention, and nonce burning
 */

import { describe, it, expect } from 'vitest';
import { ApprovalTokenManager } from './ApprovalTokenManager';

describe('ApprovalTokenManager', () => {
  it('should issue and verify a valid approval token', async () => {
    const manager = new ApprovalTokenManager('test-session-secret-key-123');
    const token = manager.createToken('delete-db-table', 'sess-001');

    expect(token.actionId).toBe('delete-db-table');
    expect(token.sessionId).toBe('sess-001');
    expect(token.sig).toBeDefined();

    const verification = await manager.verifyToken(token);
    expect(verification.valid).toBe(true);
  });

  it('should reject tampered signatures and burn the nonce', async () => {
    const manager = new ApprovalTokenManager('test-session-secret-key-123');
    const token = manager.createToken('transfer-funds', 'sess-001');

    // Tamper signature
    token.sig = 'forged-signature-attempt';

    // 1st attempt: fails because signature is forged
    const firstAttempt = await manager.verifyToken(token);
    expect(firstAttempt.valid).toBe(false);
    expect(firstAttempt.reason).toContain('Invalid token signature');

    // 2nd attempt with correct signature but same nonce: must fail because nonce was burned
    const validToken = manager.createToken('transfer-funds', 'sess-001');
    validToken.nonce = token.nonce;
    validToken.sig = manager.signToken(validToken);

    const secondAttempt = await manager.verifyToken(validToken);
    expect(secondAttempt.valid).toBe(false);
    expect(secondAttempt.reason).toContain('replay attack detected');
  });

  it('should reject replay attempts of previously valid tokens', async () => {
    const manager = new ApprovalTokenManager('test-session-secret-key-123');
    const token = manager.createToken('charge-card', 'sess-001');

    // First use: Valid
    const res1 = await manager.verifyToken(token);
    expect(res1.valid).toBe(true);

    // Second use: Replay attempt rejected
    const res2 = await manager.verifyToken(token);
    expect(res2.valid).toBe(false);
    expect(res2.reason).toContain('replay attack detected');
  });

  it('should reject expired tokens', async () => {
    const manager = new ApprovalTokenManager('test-session-secret-key-123');
    // Token with 10ms TTL
    const token = manager.createToken('action-expire', 'sess-001', 10);

    await new Promise(resolve => setTimeout(resolve, 25));

    const result = await manager.verifyToken(token);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Token has expired');
  });

  it('should reject tokens created with different session secrets', async () => {
    const managerA = new ApprovalTokenManager('secret-alpha');
    const managerB = new ApprovalTokenManager('secret-beta');

    const tokenA = managerA.createToken('action-secret', 'sess-001');
    const resultB = await managerB.verifyToken(tokenA);

    expect(resultB.valid).toBe(false);
    expect(resultB.reason).toContain('Invalid token signature');
  });
});
