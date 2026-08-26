/**
 * Phase 0 Spike: HMAC Approval Token Scheme Validation
 *
 * Goal: Validate end-to-end approval token flow with replay prevention.
 * Per TRD §4.4: Single-use, signed tokens for human-in-the-loop approvals.
 */

import crypto from 'crypto';

/**
 * Approval Token Manager
 * Handles token generation, verification, and replay prevention
 */
class ApprovalTokenManager {
  constructor(sessionSecret) {
    this.sessionSecret = sessionSecret;
    this.usedNonces = new Set(); // In production: use Redis or persistent storage
  }

  /**
   * Create a new approval token
   * @param {string} actionId - Unique identifier for the action requiring approval
   * @param {string} sessionId - Current session identifier
   * @param {number} ttlMs - Time-to-live in milliseconds (default: 120000 = 2 minutes)
   */
  createToken(actionId, sessionId, ttlMs = 120000) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = Date.now();
    const expiresAt = issuedAt + ttlMs;

    const token = {
      actionId,
      sessionId,
      nonce,
      issuedAt,
      expiresAt,
      sig: null // Will be set below
    };

    // Sign the token
    token.sig = this._sign(token);

    return token;
  }

  /**
   * Verify an approval token
   * Returns { valid: boolean, reason?: string }
   */
  verifyToken(token) {
    // Check 1: Token structure
    if (!token || !token.actionId || !token.sessionId || !token.nonce || !token.sig) {
      return { valid: false, reason: 'Invalid token structure' };
    }

    // Check 2: Signature validity
    const expectedSig = this._sign(token);
    if (token.sig !== expectedSig) {
      // CRITICAL: Invalidate nonce even on signature failure (prevents timing attacks)
      this.usedNonces.add(token.nonce);
      return { valid: false, reason: 'Invalid signature' };
    }

    // Check 3: TTL expiration
    if (Date.now() > token.expiresAt) {
      this.usedNonces.add(token.nonce);
      return { valid: false, reason: 'Token expired' };
    }

    // Check 4: Replay prevention - nonce already used?
    if (this.usedNonces.has(token.nonce)) {
      return { valid: false, reason: 'Token already used (replay detected)' };
    }

    // CRITICAL: Mark nonce as used IMMEDIATELY
    this.usedNonces.add(token.nonce);

    return { valid: true };
  }

  /**
   * Sign a token using HMAC-SHA256
   */
  _sign(token) {
    const message = `${token.actionId}.${token.sessionId}.${token.nonce}.${token.issuedAt}.${token.expiresAt}`;
    return crypto
      .createHmac('sha256', this.sessionSecret)
      .update(message)
      .digest('hex');
  }
}

/**
 * Simulated agent with pauseForApproval capability
 */
class Agent {
  constructor(tokenManager) {
    this.tokenManager = tokenManager;
    this.pendingApprovals = new Map();
  }

  /**
   * Pause execution until approval is granted
   * Returns a Promise that resolves when approval is received
   */
  async pauseForApproval(actionId, sessionId, summary) {
    console.log(`[Agent] Pausing for approval: ${summary}`);

    // Create approval token
    const token = this.tokenManager.createToken(actionId, sessionId);

    // Send token to client (simulated)
    console.log(`[Agent] Approval token issued: ${token.nonce.substring(0, 8)}...`);

    // Return a promise that resolves when approved
    return new Promise((resolve, reject) => {
      this.pendingApprovals.set(actionId, { resolve, reject, token });
    });
  }

  /**
   * Receive approval token from client
   */
  receiveApproval(token) {
    console.log(`[Agent] Received approval token: ${token.nonce.substring(0, 8)}...`);

    const verification = this.tokenManager.verifyToken(token);

    if (!verification.valid) {
      console.log(`[Agent] Approval REJECTED: ${verification.reason}`);

      const pending = this.pendingApprovals.get(token.actionId);
      if (pending) {
        pending.reject(new Error(`Approval rejected: ${verification.reason}`));
        this.pendingApprovals.delete(token.actionId);
      }
      return false;
    }

    console.log(`[Agent] Approval ACCEPTED`);

    const pending = this.pendingApprovals.get(token.actionId);
    if (pending) {
      pending.resolve(true);
      this.pendingApprovals.delete(token.actionId);
    }

    return true;
  }

  /**
   * Execute a sensitive action with approval gate
   */
  async executeSensitiveAction(actionId, sessionId, actionFn) {
    console.log(`\n[Agent] Preparing to execute sensitive action: ${actionId}`);

    // Pause for approval
    await this.pauseForApproval(actionId, sessionId, `Execute ${actionId}`);

    console.log(`[Agent] Approval granted, executing action...`);
    const result = await actionFn();
    console.log(`[Agent] Action completed: ${result}`);

    return result;
  }
}

/**
 * Test Suite
 */

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      return true;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(`  ${error.message}`);
      return false;
    }
  })();
}

// Test utilities
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
console.log('\n=== Phase 0 Spike: Approval Token Validation ===\n');

const results = await Promise.all([
  // Test 1: Valid token verification
  test('Valid token passes verification', async () => {
    const manager = new ApprovalTokenManager('test-secret');
    const token = manager.createToken('action-1', 'session-1');
    const result = manager.verifyToken(token);

    if (!result.valid) {
      throw new Error('Valid token should pass verification');
    }
  }),

  // Test 2: Tampered signature fails
  test('Tampered signature is rejected', async () => {
    const manager = new ApprovalTokenManager('test-secret');
    const token = manager.createToken('action-2', 'session-1');

    // Tamper with signature
    token.sig = 'tampered-signature';

    const result = manager.verifyToken(token);

    if (result.valid) {
      throw new Error('Tampered token should fail verification');
    }
    if (result.reason !== 'Invalid signature') {
      throw new Error(`Expected 'Invalid signature', got '${result.reason}'`);
    }
  }),

  // Test 3: Expired token fails
  test('Expired token is rejected', async () => {
    const manager = new ApprovalTokenManager('test-secret');
    const token = manager.createToken('action-3', 'session-1', 100); // 100ms TTL

    await sleep(150); // Wait for expiration

    const result = manager.verifyToken(token);

    if (result.valid) {
      throw new Error('Expired token should fail verification');
    }
    if (result.reason !== 'Token expired') {
      throw new Error(`Expected 'Token expired', got '${result.reason}'`);
    }
  }),

  // Test 4: Replay attack prevention
  test('Token replay is prevented', async () => {
    const manager = new ApprovalTokenManager('test-secret');
    const token = manager.createToken('action-4', 'session-1');

    // First use: should succeed
    const result1 = manager.verifyToken(token);
    if (!result1.valid) {
      throw new Error('First token use should succeed');
    }

    // Second use: should fail (replay)
    const result2 = manager.verifyToken(token);
    if (result2.valid) {
      throw new Error('Token replay should fail');
    }
    if (result2.reason !== 'Token already used (replay detected)') {
      throw new Error(`Expected replay detection, got '${result2.reason}'`);
    }
  }),

  // Test 5: Nonce invalidated even on signature failure
  test('Nonce invalidated on failed verification', async () => {
    const manager = new ApprovalTokenManager('test-secret');
    const token = manager.createToken('action-5', 'session-1');

    // Tamper and verify (fails)
    token.sig = 'tampered';
    manager.verifyToken(token);

    // Fix signature and try again (should still fail - nonce is burned)
    const validToken = manager.createToken('action-5', 'session-1');
    validToken.nonce = token.nonce; // Reuse the burned nonce
    validToken.sig = manager._sign(validToken);

    const result = manager.verifyToken(validToken);
    if (result.valid) {
      throw new Error('Burned nonce should not be reusable');
    }
  }),

  // Test 6: Different session secrets produce different signatures
  test('Different session secrets are incompatible', async () => {
    const manager1 = new ApprovalTokenManager('secret-1');
    const manager2 = new ApprovalTokenManager('secret-2');

    const token = manager1.createToken('action-6', 'session-1');

    // Manager 2 should reject token created by Manager 1
    const result = manager2.verifyToken(token);

    if (result.valid) {
      throw new Error('Token from different secret should fail');
    }
  }),

  // Test 7: Agent pauseForApproval flow
  test('Agent pauseForApproval blocks until approval', async () => {
    const manager = new ApprovalTokenManager('test-secret');
    const agent = new Agent(manager);

    let actionExecuted = false;

    // Start sensitive action (will pause)
    const actionPromise = agent.executeSensitiveAction(
      'test-action',
      'session-1',
      async () => {
        actionExecuted = true;
        return 'success';
      }
    );

    // Action should not execute yet
    await sleep(50);
    if (actionExecuted) {
      throw new Error('Action should not execute before approval');
    }

    // Get the pending approval token
    const pending = agent.pendingApprovals.get('test-action');
    if (!pending) {
      throw new Error('Approval should be pending');
    }

    // Approve it
    agent.receiveApproval(pending.token);

    // Wait for action to complete
    await actionPromise;

    if (!actionExecuted) {
      throw new Error('Action should execute after approval');
    }
  }),

  // Test 8: Rejected approval prevents execution
  test('Rejected approval prevents action execution', async () => {
    const manager = new ApprovalTokenManager('test-secret');
    const agent = new Agent(manager);

    let actionExecuted = false;

    // Start sensitive action
    const actionPromise = agent.executeSensitiveAction(
      'reject-test',
      'session-1',
      async () => {
        actionExecuted = true;
        return 'success';
      }
    ).catch(err => err); // Catch rejection

    await sleep(50);

    // Get the pending approval token and tamper it
    const pending = agent.pendingApprovals.get('reject-test');
    const tamperedToken = { ...pending.token, sig: 'invalid' };

    // Try to approve with tampered token
    agent.receiveApproval(tamperedToken);

    // Wait for rejection
    const result = await actionPromise;

    if (actionExecuted) {
      throw new Error('Action should not execute with rejected approval');
    }
    if (!(result instanceof Error)) {
      throw new Error('Should receive error on rejection');
    }
  }),

  // Test 9: Multiple concurrent approvals
  test('Multiple concurrent approvals work independently', async () => {
    const manager = new ApprovalTokenManager('test-secret');
    const agent = new Agent(manager);

    const results = [];

    // Start multiple actions
    const promise1 = agent.executeSensitiveAction('action-1', 'session-1', async () => 'result-1');
    const promise2 = agent.executeSensitiveAction('action-2', 'session-1', async () => 'result-2');
    const promise3 = agent.executeSensitiveAction('action-3', 'session-1', async () => 'result-3');

    await sleep(50);

    // Approve in different order
    agent.receiveApproval(agent.pendingApprovals.get('action-2').token);
    agent.receiveApproval(agent.pendingApprovals.get('action-1').token);
    agent.receiveApproval(agent.pendingApprovals.get('action-3').token);

    const [r1, r2, r3] = await Promise.all([promise1, promise2, promise3]);

    if (r1 !== 'result-1' || r2 !== 'result-2' || r3 !== 'result-3') {
      throw new Error('All actions should complete with correct results');
    }
  })
]);

const passed = results.filter(r => r).length;
const total = results.length;

console.log(`\n=== Results: ${passed}/${total} tests passed ===\n`);

if (passed === total) {
  console.log('✓ HMAC approval token scheme validation SUCCESSFUL');
  console.log('✓ Token generation and verification work correctly');
  console.log('✓ Replay prevention is effective');
  console.log('✓ Nonce invalidation is immediate (even on failure)');
  console.log('✓ pauseForApproval() genuinely blocks execution');
  console.log('\nDecision: Proceed with HMAC token scheme from TRD §4.4');
} else {
  console.log('✗ Approval token validation FAILED');
  console.log('✗ Design needs revision before Phase 3');
}
