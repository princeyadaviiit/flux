/**
 * FluxTransport - Unified transport layer combining SSE and WebSocket
 * Per TRD §4.1: Single API for bidirectional communication
 *
 * SSE: Agent→Client (streaming, one-way)
 * WebSocket: Client→Agent (bidirectional)
 */

import { SSEClient, SSEConnectionState } from './SSEClient';
import { WebSocketClient, WebSocketConnectionState } from './WebSocketClient';
import { FluxEnvelope, FluxEventType } from './protocol';

export type TransportConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface FluxTransportOptions {
  /** SSE endpoint URL for agent→client streaming */
  sseUrl: string;

  /** WebSocket endpoint URL for client→agent communication */
  wsUrl: string;

  /** Initial Last-Event-ID for SSE resumption */
  lastEventId?: string;

  /** Enable automatic reconnection for both channels */
  reconnect?: boolean;

  /** WebSocket protocols */
  wsProtocols?: string[];
}

export interface TransportState {
  /** Overall connection state */
  state: TransportConnectionState;

  /** SSE connection state */
  sseState: SSEConnectionState;

  /** WebSocket connection state */
  wsState: WebSocketConnectionState;

  /** Last received event ID from SSE */
  lastEventId?: string;

  /** Number of queued WebSocket messages */
  queuedMessages: number;
}

type EventCallback<T = unknown> = (envelope: FluxEnvelope<T>) => void;
type StateCallback = (state: TransportState) => void;
type ErrorCallback = (error: Error, channel: 'sse' | 'ws') => void;

/**
 * Unified transport layer for Flux
 *
 * Combines SSE (for agent→client streaming) and WebSocket (for client→agent messaging)
 * into a single cohesive API with unified connection management.
 */
export class FluxTransport {
  private sseClient: SSEClient;
  private wsClient: WebSocketClient;

  private stateListeners = new Set<StateCallback>();
  private errorListeners = new Set<ErrorCallback>();

  constructor(options: FluxTransportOptions) {
    // Initialize SSE client for receiving
    this.sseClient = new SSEClient({
      url: options.sseUrl,
      lastEventId: options.lastEventId,
      reconnect: {
        enabled: options.reconnect ?? true,
        baseDelay: 250,
        maxDelay: 8000,
        jitter: 0.2,
      },
    });

    // Initialize WebSocket client for sending
    this.wsClient = new WebSocketClient({
      url: options.wsUrl,
      reconnect: {
        enabled: options.reconnect ?? true,
        baseDelay: 250,
        maxDelay: 8000,
        jitter: 0.2,
      },
      protocols: options.wsProtocols,
    });

    // Set up state listeners
    this.sseClient.onStateChange(() => this.notifyStateChange());
    this.wsClient.onStateChange(() => this.notifyStateChange());

    // Set up error listeners
    this.sseClient.onError((error) => this.emitError(error, 'sse'));
    this.wsClient.onError((error) => this.emitError(error, 'ws'));
  }

  /**
   * Connect both SSE and WebSocket channels
   */
  connect(): void {
    this.sseClient.connect();
    this.wsClient.connect();
  }

  /**
   * Disconnect both channels
   */
  disconnect(): void {
    this.sseClient.disconnect();
    this.wsClient.disconnect();
  }

  /**
   * Send envelope via WebSocket
   */
  send(envelope: FluxEnvelope): void {
    this.wsClient.send(envelope);
  }

  /**
   * Subscribe to specific event type
   * Events are received via SSE channel
   */
  on<T = unknown>(type: FluxEventType, callback: EventCallback<T>): () => void {
    return this.sseClient.on(type, callback);
  }

  /**
   * Subscribe to transport state changes
   */
  onStateChange(callback: StateCallback): () => void {
    this.stateListeners.add(callback);

    // Immediately notify with current state
    callback(this.getState());

    return () => this.stateListeners.delete(callback);
  }

  /**
   * Subscribe to errors from either channel
   */
  onError(callback: ErrorCallback): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  /**
   * Get current transport state
   */
  getState(): TransportState {
    const sseState = this.sseClient.getState();
    const wsState = this.wsClient.getState();

    return {
      state: this.computeOverallState(sseState, wsState),
      sseState,
      wsState,
      lastEventId: this.sseClient.getLastEventId(),
      queuedMessages: this.wsClient.getQueuedMessageCount(),
    };
  }

  /**
   * Get last received event ID (for resumption)
   */
  getLastEventId(): string | undefined {
    return this.sseClient.getLastEventId();
  }

  /**
   * Check if transport is fully connected
   */
  isConnected(): boolean {
    return this.getState().state === 'connected';
  }

  /**
   * Check if transport is connecting
   */
  isConnecting(): boolean {
    return this.getState().state === 'connecting';
  }

  /**
   * Check if transport is reconnecting
   */
  isReconnecting(): boolean {
    return this.getState().state === 'reconnecting';
  }

  /**
   * Compute overall state from SSE and WebSocket states
   */
  private computeOverallState(
    sseState: SSEConnectionState,
    wsState: WebSocketConnectionState
  ): TransportConnectionState {
    // If either is disconnected, overall is disconnected
    if (sseState === 'disconnected' || wsState === 'disconnected') {
      return 'disconnected';
    }

    // If either is reconnecting, overall is reconnecting
    if (sseState === 'reconnecting' || wsState === 'reconnecting') {
      return 'reconnecting';
    }

    // If both are connected, overall is connected
    if (sseState === 'connected' && wsState === 'connected') {
      return 'connected';
    }

    // Otherwise (at least one is connecting), overall is connecting
    return 'connecting';
  }

  /**
   * Notify state change listeners
   */
  private notifyStateChange(): void {
    const state = this.getState();
    this.stateListeners.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        console.error('[FluxTransport] Error in state listener:', error);
      }
    });
  }

  /**
   * Emit error to listeners
   */
  private emitError(error: Error, channel: 'sse' | 'ws'): void {
    this.errorListeners.forEach((callback) => {
      try {
        callback(error, channel);
      } catch (err) {
        console.error('[FluxTransport] Error in error listener:', err);
      }
    });
  }
}

/**
 * Helper function to create FluxTransport with common defaults
 */
export function createFluxTransport(options: FluxTransportOptions): FluxTransport {
  return new FluxTransport(options);
}
