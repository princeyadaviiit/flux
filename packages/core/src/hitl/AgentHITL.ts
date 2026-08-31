/**
 * AgentHITL
 * Server-side Human-in-the-Loop execution gating primitive.
 * Specifications: TRD §4.4, PRD FR-4.1, FR-4.2, RULES.md §1.3
 */

import { ApprovalTokenManager } from './ApprovalTokenManager';
import { ApprovalRequest, ApprovalResult, ApprovalToken } from './types';

interface PendingApprovalState {
  request: ApprovalRequest;
  sessionId: string;
  token: ApprovalToken;
  timer: NodeJS.Timeout;
  resolve: (result: ApprovalResult) => void;
  reject: (reason: Error) => void;
}

export type ApprovalRequestListener = (request: ApprovalRequest, token: ApprovalToken) => void;

export class AgentHITL {
  private tokenManager: ApprovalTokenManager;
  private pendingApprovals: Map<string, PendingApprovalState> = new Map();
  private requestListeners: Set<ApprovalRequestListener> = new Set();

  constructor(tokenManager: ApprovalTokenManager | string) {
    if (typeof tokenManager === 'string') {
      this.tokenManager = new ApprovalTokenManager(tokenManager);
    } else {
      this.tokenManager = tokenManager;
    }
  }

  /**
   * Subscribe to new approval requests (e.g. to broadcast approval.request envelopes)
   */
  public onRequest(listener: ApprovalRequestListener): () => void {
    this.requestListeners.add(listener);
    return () => this.requestListeners.delete(listener);
  }

  /**
   * Suspend agent execution until a valid approval token is verified or TTL expires
   */
  public async pauseForApproval(
    request: ApprovalRequest,
    sessionId: string
  ): Promise<ApprovalResult> {
    const ttlMs = request.ttlMs || 120_000;
    const token = this.tokenManager.createToken(request.actionId, sessionId, ttlMs);

    return new Promise<ApprovalResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingApprovals.has(request.actionId)) {
          this.pendingApprovals.delete(request.actionId);
          resolve({
            approved: false,
            actionId: request.actionId,
            reason: 'Approval request timed out (TTL expired)',
          });
        }
      }, ttlMs);

      const state: PendingApprovalState = {
        request,
        sessionId,
        token,
        timer,
        resolve,
        reject,
      };

      this.pendingApprovals.set(request.actionId, state);

      // Notify listeners to transmit approval.request envelope to client
      this.notifyRequest(request, token);
    });
  }

  /**
   * Receive and verify an approval token from client
   */
  public async receiveApproval(token: ApprovalToken): Promise<ApprovalResult> {
    const pending = this.pendingApprovals.get(token.actionId);

    if (!pending) {
      return {
        approved: false,
        actionId: token.actionId,
        reason: 'No pending approval found for this actionId (may have expired or completed)',
      };
    }

    const verification = await this.tokenManager.verifyToken(token);

    // Clear timeout timer
    clearTimeout(pending.timer);
    this.pendingApprovals.delete(token.actionId);

    if (!verification.valid) {
      const result: ApprovalResult = {
        approved: false,
        actionId: token.actionId,
        reason: verification.reason || 'Approval token verification failed',
      };
      pending.resolve(result);
      return result;
    }

    const approvedResult: ApprovalResult = {
      approved: true,
      actionId: token.actionId,
      token,
    };

    pending.resolve(approvedResult);
    return approvedResult;
  }

  /**
   * Explicitly reject a pending action
   */
  public receiveRejection(actionId: string, reason?: string): ApprovalResult {
    const pending = this.pendingApprovals.get(actionId);

    if (!pending) {
      return {
        approved: false,
        actionId,
        reason: 'No pending approval found for this actionId',
      };
    }

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(actionId);

    const result: ApprovalResult = {
      approved: false,
      actionId,
      reason: reason || 'Approval rejected by user',
    };

    pending.resolve(result);
    return result;
  }

  /**
   * Gated execution helper: halts execution until approval is confirmed
   */
  public async executeGatedAction<T>(
    request: ApprovalRequest,
    sessionId: string,
    actionFn: () => Promise<T>
  ): Promise<T> {
    const result = await this.pauseForApproval(request, sessionId);

    if (!result.approved) {
      throw new Error(`Sensitive action '${request.actionId}' not approved: ${result.reason}`);
    }

    return await actionFn();
  }

  /**
   * Check if an action is currently pending approval
   */
  public isPending(actionId: string): boolean {
    return this.pendingApprovals.has(actionId);
  }

  /**
   * Get pending approval state for an action
   */
  public getPendingToken(actionId: string): ApprovalToken | undefined {
    return this.pendingApprovals.get(actionId)?.token;
  }

  private notifyRequest(request: ApprovalRequest, token: ApprovalToken): void {
    this.requestListeners.forEach(listener => {
      try {
        listener(request, token);
      } catch (err) {
        console.error('[AgentHITL] Request listener error:', err);
      }
    });
  }
}
