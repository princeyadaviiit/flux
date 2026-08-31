/**
 * AgentHITL Unit & Integration Tests
 * Validates execution pause, approval resolution, rejection, and timeout handling.
 */

import { describe, it, expect, vi } from 'vitest';
import { AgentHITL } from './AgentHITL';
import { ApprovalTokenManager } from './ApprovalTokenManager';

describe('AgentHITL', () => {
  it('should genuinely pause execution until approval is granted', async () => {
    const hitl = new AgentHITL('test-secret');
    let actionExecuted = false;

    // Start gated action in background
    const actionPromise = hitl.executeGatedAction(
      { actionId: 'deploy-prod', summary: 'Deploy to Production' },
      'session-abc',
      async () => {
        actionExecuted = true;
        return { status: 'deployed' };
      }
    );

    // Verify action has NOT executed yet while waiting
    await new Promise(r => setTimeout(r, 25));
    expect(actionExecuted).toBe(false);
    expect(hitl.isPending('deploy-prod')).toBe(true);

    // Provide valid token
    const token = hitl.getPendingToken('deploy-prod');
    expect(token).toBeDefined();

    const approvalResult = await hitl.receiveApproval(token!);
    expect(approvalResult.approved).toBe(true);

    // Now the gated action completes
    const result = await actionPromise;
    expect(actionExecuted).toBe(true);
    expect(result).toEqual({ status: 'deployed' });
  });

  it('should block execution and throw error when user rejects', async () => {
    const hitl = new AgentHITL('test-secret');
    let actionExecuted = false;

    const actionPromise = hitl.executeGatedAction(
      { actionId: 'wipe-database', summary: 'Wipe all records' },
      'session-abc',
      async () => {
        actionExecuted = true;
        return 'wiped';
      }
    );

    await new Promise(r => setTimeout(r, 20));
    expect(actionExecuted).toBe(false);

    // Explicit rejection
    hitl.receiveRejection('wipe-database', 'Permission denied by Admin');

    await expect(actionPromise).rejects.toThrow('Permission denied by Admin');
    expect(actionExecuted).toBe(false);
  });

  it('should timeout if approval is not received within ttlMs', async () => {
    const hitl = new AgentHITL('test-secret');
    let actionExecuted = false;

    const actionPromise = hitl.executeGatedAction(
      { actionId: 'quick-action', summary: 'Quick task', ttlMs: 30 },
      'session-abc',
      async () => {
        actionExecuted = true;
        return 'done';
      }
    );

    await expect(actionPromise).rejects.toThrow('timed out');
    expect(actionExecuted).toBe(false);
  });

  it('should support multiple concurrent independent approvals', async () => {
    const hitl = new AgentHITL('test-secret');

    const p1 = hitl.pauseForApproval({ actionId: 'action-1', summary: 'Task 1' }, 's1');
    const p2 = hitl.pauseForApproval({ actionId: 'action-2', summary: 'Task 2' }, 's1');

    expect(hitl.isPending('action-1')).toBe(true);
    expect(hitl.isPending('action-2')).toBe(true);

    const token2 = hitl.getPendingToken('action-2')!;
    const token1 = hitl.getPendingToken('action-1')!;

    // Resolve in reverse order
    await hitl.receiveApproval(token2);
    await hitl.receiveApproval(token1);

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.approved).toBe(true);
    expect(res2.approved).toBe(true);
  });

  it('should notify request listeners when approval is requested', async () => {
    const hitl = new AgentHITL('test-secret');
    const listener = vi.fn();
    hitl.onRequest(listener);

    hitl.pauseForApproval({ actionId: 'notify-test', summary: 'Check notification' }, 's1');

    expect(listener).toHaveBeenCalled();
    const [req, tok] = listener.mock.calls[0];
    expect(req.actionId).toBe('notify-test');
    expect(tok.sig).toBeDefined();
  });
});
