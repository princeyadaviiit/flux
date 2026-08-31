import { describe, it, expect, beforeEach } from 'vitest';
import { AsymmetricTokenManager } from './AsymmetricTokenManager';

describe('AsymmetricTokenManager (HITL v2)', () => {
  let keyPair: { publicKey: string; privateKey: string };
  let manager: AsymmetricTokenManager;

  beforeEach(() => {
    keyPair = AsymmetricTokenManager.generateKeyPair();
    manager = new AsymmetricTokenManager({
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      defaultTtlMs: 60000,
    });
  });

  it('generates and verifies asymmetric ECDSA approval tokens', async () => {
    const token = manager.createToken('act-transfer-funds', 'sess-001');

    expect(token.sig).toBeDefined();
    expect(typeof token.sig).toBe('string');
    expect(token.nonce.length).toBe(64); // 32-byte hex

    const verification = await manager.verifyToken(token);
    expect(verification.valid).toBe(true);
  });

  it('enforces immediate nonce invalidation against replay attacks (RULES.md §1.4)', async () => {
    const token = manager.createToken('act-delete-db', 'sess-002');

    const firstCheck = await manager.verifyToken(token);
    expect(firstCheck.valid).toBe(true);

    // Replay attempt with same token and nonce
    const replayCheck = await manager.verifyToken(token);
    expect(replayCheck.valid).toBe(false);
    expect(replayCheck.reason).toContain('replay attempt');
  });

  it('burns nonce immediately even on signature verification failure', async () => {
    const token = manager.createToken('act-admin-grant', 'sess-003');

    // Tamper with signature
    const tampered = { ...token, sig: token.sig.slice(0, -4) + '0000' };

    const firstCheck = await manager.verifyToken(tampered);
    expect(firstCheck.valid).toBe(false);

    // Second check with exact same token should fail due to burned nonce, preventing timing/oracle attacks
    const secondCheck = await manager.verifyToken(tampered);
    expect(secondCheck.valid).toBe(false);
    expect(secondCheck.reason).toContain('replay attempt');
  });

  it('rejects expired tokens', async () => {
    const token = manager.createToken('act-quick-action', 'sess-004', 50);

    const verification = await manager.verifyToken(token, {
      currentTime: Date.now() + 1000, // 1 second later
    });

    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain('expired');
  });

  it('rejects tokens signed by an untrusted or rotated private key', async () => {
    const attackerKeyPair = AsymmetricTokenManager.generateKeyPair();
    const attackerManager = new AsymmetricTokenManager({
      privateKey: attackerKeyPair.privateKey,
      publicKey: attackerKeyPair.publicKey,
    });

    const forgedToken = attackerManager.createToken('act-drain-wallet', 'sess-005');

    // Verify forged token with victim's public key
    const verification = await manager.verifyToken(forgedToken);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain('Invalid asymmetric signature');
  });
});
