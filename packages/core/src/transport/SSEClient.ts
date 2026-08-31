/**
 * SSEClient - Server-Sent Events client with automatic reconnection
 * Per TRD §4.1: Agent→Client streaming via SSE
 */

import { FluxEnvelope, FluxEventType } from './protocol';

export type SSEConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface SSEClientOptions {
  /** SSE endpoint URL */
  url: string;

  /** Initial Last-Event-ID for resumption */
  lastEventId?: string;

  /** Reconnection settings */
  reconnect?: {
    /** Enable automatic reconnection */
    enabled: boolean;

    /** Base delay in ms (default: 250) */
    baseDelay: number;

    /** Maximum delay in ms (default: 8000) */
    maxDelay: number;

    /** Jitter percentage 0-1 (default: 0.2) */
    jitter: number;
  };

  /** Custom headers */
  headers?: Record<string, string>;
}

type EventCallback<T = unknown> = (envelope: FluxEnvelope<T>) => void;
type StateCallback = (state: SSEConnectionState) => void;
type ErrorCallback = (error: Error) => void;

/**
 * SSE Client with multiplexed event handling and auto-reconnect
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private state: SSEConnectionState = 'disconnected';
  private lastEventId: string | undefined;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Event subscribers organized by type
  private subscribers = new Map<FluxEventType, Set<EventCallback>>();
  private stateListeners = new Set<StateCallback>();
  private errorListeners = new Set<ErrorCallback>();

  constructor(private options: SSEClientOptions) {
    this.lastEventId = options.lastEventId;

    // Set default reconnect options
    if (!this.options.reconnect) {
      this.options.reconnect = {
        enabled: true,
        baseDelay: 250,
        maxDelay: 8000,
        jitter: 0.2,
      };
    }
  }

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') {
      console.warn('[SSEClient] Already connected or connecting');
      return;
    }

    this.setState('connecting');
    this.createEventSource();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.clearReconnectTimer();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setState('disconnected');
  }

  /**
   * Subscribe to specific event type
   */
  on<T = unknown>(type: FluxEventType, callback: EventCallback<T>): () => void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }

    this.subscribers.get(type)!.add(callback as EventCallback);

    // Return unsubscribe function
    return () => {
      const typeSubscribers = this.subscribers.get(type);
      if (typeSubscribers) {
        typeSubscribers.delete(callback as EventCallback);
      }
    };
  }

  /**
   * Subscribe to connection state changes
   */
  onStateChange(callback: StateCallback): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  /**
   * Subscribe to errors
   */
  onError(callback: ErrorCallback): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  /**
   * Get current connection state
   */
  getState(): SSEConnectionState {
    return this.state;
  }

  /**
   * Get last received event ID
   */
  getLastEventId(): string | undefined {
    return this.lastEventId;
  }

  /**
   * Create EventSource with headers
   */
  private createEventSource(): void {
    // Build URL with Last-Event-ID if available
    const url = new URL(this.options.url);
    if (this.lastEventId) {
      url.searchParams.set('lastEventId', this.lastEventId);
    }

    try {
      // Note: EventSource in browser doesn't support custom headers
      // For custom headers, we'd need a polyfill or server-side implementation
      this.eventSource = new EventSource(url.toString());

      this.eventSource.onopen = () => {
        this.reconnectAttempt = 0;
        this.setState('connected');
      };

      this.eventSource.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.eventSource.onerror = () => {
        this.handleError();
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(err);
      this.handleError();
    }
  }

  /**
   * Handle incoming SSE message
   */
  private handleMessage(event: MessageEvent): void {
    // Update last event ID for resume capability
    if (event.lastEventId) {
      this.lastEventId = event.lastEventId;
    }

    try {
      const envelope = JSON.parse(event.data) as FluxEnvelope;

      // Validate envelope structure
      if (!this.isValidEnvelope(envelope)) {
        throw new Error('Invalid envelope structure');
      }

      // Dispatch to subscribers for this event type
      const typeSubscribers = this.subscribers.get(envelope.type);
      if (typeSubscribers) {
        typeSubscribers.forEach((callback) => {
          try {
            callback(envelope);
          } catch (error) {
            console.error(`[SSEClient] Error in subscriber callback:`, error);
          }
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(new Error(`Failed to parse message: ${err.message}`));
    }
  }

  /**
   * Handle connection error
   */
  private handleError(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.options.reconnect?.enabled && this.state !== 'disconnected') {
      this.scheduleReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  /**
   * Schedule reconnection with exponential backoff and jitter
   */
  private scheduleReconnect(): void {
    this.setState('reconnecting');

    const { baseDelay, maxDelay, jitter } = this.options.reconnect!;

    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempt),
      maxDelay
    );

    // Add jitter: ±20% by default
    const jitterAmount = exponentialDelay * jitter;
    const delay = exponentialDelay + (Math.random() * 2 - 1) * jitterAmount;

    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createEventSource();
    }, delay);
  }

  /**
   * Clear reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Update and notify state change
   */
  private setState(newState: SSEConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach((callback) => {
        try {
          callback(newState);
        } catch (error) {
          console.error('[SSEClient] Error in state listener:', error);
        }
      });
    }
  }

  /**
   * Emit error to listeners
   */
  private emitError(error: Error): void {
    this.errorListeners.forEach((callback) => {
      try {
        callback(error);
      } catch (err) {
        console.error('[SSEClient] Error in error listener:', err);
      }
    });
  }

  /**
   * Validate envelope structure
   */
  private isValidEnvelope(envelope: unknown): envelope is FluxEnvelope {
    if (!envelope || typeof envelope !== 'object') return false;

    const env = envelope as Record<string, unknown>;

    return (
      typeof env.id === 'string' &&
      typeof env.type === 'string' &&
      typeof env.seq === 'number' &&
      typeof env.ts === 'number' &&
      'payload' in env
    );
  }
}
