/**
 * FluxEnvelope - Unified message format for all event types
 * Per TRD §4.1: Multiplexed event protocol
 */

/**
 * Discriminated union of all event types in the Flux protocol
 */
export type FluxEventType =
  | 'text.delta'
  | 'ui.schema.delta'
  | 'tool.call'
  | 'tool.result'
  | 'state.patch'
  | 'state.update'
  | 'approval.request'
  | 'approval.token'
  | 'error'
  | 'ping';

/**
 * Generic envelope wrapper for all Flux events
 *
 * @template T - Payload type for this event
 */
export interface FluxEnvelope<T = unknown> {
  /** Unique message identifier (ULID recommended) */
  id: string;

  /** Event type discriminant */
  type: FluxEventType;

  /** Monotonically increasing sequence number per connection */
  seq: number;

  /** Server-side timestamp in milliseconds since epoch */
  ts: number;

  /** Event-specific payload */
  payload: T;
}

/**
 * Text delta payload - streaming text from agent
 */
export interface TextDeltaPayload {
  /** Incremental text chunk */
  delta: string;

  /** Optional stream identifier for multiple concurrent streams */
  streamId?: string;
}

/**
 * UI schema delta payload - streaming UI configuration
 */
export interface UISchemaDeltaPayload {
  /** Incremental JSON chunk */
  delta: string;

  /** UI component identifier */
  componentId: string;

  /** Whether this is the final chunk */
  final?: boolean;
}

/**
 * Tool call payload - agent invoking a tool
 */
export interface ToolCallPayload {
  /** Tool identifier */
  toolId: string;

  /** Tool name */
  name: string;

  /** Tool arguments */
  args: Record<string, unknown>;
}

/**
 * Tool result payload - result from tool execution
 */
export interface ToolResultPayload {
  /** Corresponding tool call ID */
  toolId: string;

  /** Execution result */
  result: unknown;

  /** Error if tool execution failed */
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * State patch payload - JSON Patch operation from client
 */
export interface StatePatchPayload {
  /** JSON Patch operations (RFC 6902) */
  ops: Array<{
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
    path: string;
    value?: unknown;
    from?: string;
  }>;
}

/**
 * State update payload - Yjs update or derived patch from server
 */
export interface StateUpdatePayload {
  /** Yjs binary update (base64 encoded) */
  update?: string;

  /** Optional derived JSON Patch for agent context */
  patch?: Array<{
    op: 'add' | 'remove' | 'replace';
    path: string;
    value?: unknown;
  }>;
}

/**
 * Approval request payload - agent requesting human approval
 */
export interface ApprovalRequestPayload {
  /** Action identifier */
  actionId: string;

  /** Human-readable summary of action */
  summary: string;

  /** Optional structured detail for custom approval UI */
  detail?: unknown;

  /** Server-issued nonce for token generation */
  nonce: string;

  /** Token expiration timestamp */
  expiresAt: number;
}

/**
 * Approval token payload - client approving an action
 */
export interface ApprovalTokenPayload {
  /** Action identifier being approved */
  actionId: string;

  /** Session identifier */
  sessionId: string;

  /** Server-issued nonce */
  nonce: string;

  /** Token issue timestamp */
  issuedAt: number;

  /** Token expiration timestamp */
  expiresAt: number;

  /** HMAC-SHA256 signature */
  sig: string;
}

/**
 * Error payload - error notification
 */
export interface ErrorPayload {
  /** Error message */
  message: string;

  /** Error code */
  code?: string;

  /** Additional error context */
  context?: Record<string, unknown>;
}

/**
 * Ping payload - keepalive/heartbeat
 */
export interface PingPayload {
  /** Optional echo data */
  echo?: string;
}

/**
 * Type-safe envelope constructors
 */
export const FluxEnvelopeFactory = {
  textDelta: (id: string, seq: number, payload: TextDeltaPayload): FluxEnvelope<TextDeltaPayload> => ({
    id,
    type: 'text.delta',
    seq,
    ts: Date.now(),
    payload,
  }),

  uiSchemaDelta: (id: string, seq: number, payload: UISchemaDeltaPayload): FluxEnvelope<UISchemaDeltaPayload> => ({
    id,
    type: 'ui.schema.delta',
    seq,
    ts: Date.now(),
    payload,
  }),

  toolCall: (id: string, seq: number, payload: ToolCallPayload): FluxEnvelope<ToolCallPayload> => ({
    id,
    type: 'tool.call',
    seq,
    ts: Date.now(),
    payload,
  }),

  toolResult: (id: string, seq: number, payload: ToolResultPayload): FluxEnvelope<ToolResultPayload> => ({
    id,
    type: 'tool.result',
    seq,
    ts: Date.now(),
    payload,
  }),

  statePatch: (id: string, seq: number, payload: StatePatchPayload): FluxEnvelope<StatePatchPayload> => ({
    id,
    type: 'state.patch',
    seq,
    ts: Date.now(),
    payload,
  }),

  stateUpdate: (id: string, seq: number, payload: StateUpdatePayload): FluxEnvelope<StateUpdatePayload> => ({
    id,
    type: 'state.update',
    seq,
    ts: Date.now(),
    payload,
  }),

  approvalRequest: (id: string, seq: number, payload: ApprovalRequestPayload): FluxEnvelope<ApprovalRequestPayload> => ({
    id,
    type: 'approval.request',
    seq,
    ts: Date.now(),
    payload,
  }),

  approvalToken: (id: string, seq: number, payload: ApprovalTokenPayload): FluxEnvelope<ApprovalTokenPayload> => ({
    id,
    type: 'approval.token',
    seq,
    ts: Date.now(),
    payload,
  }),

  error: (id: string, seq: number, payload: ErrorPayload): FluxEnvelope<ErrorPayload> => ({
    id,
    type: 'error',
    seq,
    ts: Date.now(),
    payload,
  }),

  ping: (id: string, seq: number, payload: PingPayload = {}): FluxEnvelope<PingPayload> => ({
    id,
    type: 'ping',
    seq,
    ts: Date.now(),
    payload,
  }),
};
