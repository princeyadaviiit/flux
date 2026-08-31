/**
 * WebSocketClient - WebSocket client for bidirectional communication
 * Per TRD §4.1: Client→Agent communication via WebSocket
 */

import { FluxEnvelope, FluxEventType } from './protocol';

export type WebSocketConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WebSocketClientOptions {
  /** WebSocket endpoint URL */
  url: string;

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

  /** WebSocket protocols */
  protocols?: string[];
}

type MessageCallback<T = unknown> = (envelope: FluxEnvelope<T>) => void;
type StateCallback = (state: WebSocketConnectionState) => void;
type ErrorCallback = (error: Error) => void;

/**
 * WebSocket Client for bidirectional communication
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private state: WebSocketConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageQueue: FluxEnvelope[] = [];

  // Event subscribers organized by type
  private subscribers = new Map<FluxEventType, Set<MessageCallback>>();
  private stateListeners = new Set<StateCallback>();
  private errorListeners = new Set<ErrorCallback>();

  constructor(private options: WebSocketClientOptions) {
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
   * Connect to WebSocket endpoint
   */
  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') {
      console.warn('[WebSocketClient] Already connected or connecting');
      return;
    }

    this.setState('connecting');
    this.createWebSocket();
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState('disconnected');
    this.messageQueue = [];
  }

  /**
   * Send envelope to server
   * Messages are queued if not connected and sent on reconnection
   */
  send(envelope: FluxEnvelope): void {
    if (this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this.sendImmediate(envelope);
    } else {
      // Queue message for sending when connection is established
      this.messageQueue.push(envelope);
    }
  }

  /**
   * Subscribe to specific event type
   */
  on<T = unknown>(type: FluxEventType, callback: MessageCallback<T>): () => void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }

    this.subscribers.get(type)!.add(callback as MessageCallback);

    // Return unsubscribe function
    return () => {
      const typeSubscribers = this.subscribers.get(type);
      if (typeSubscribers) {
        typeSubscribers.delete(callback as MessageCallback);
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
  getState(): WebSocketConnectionState {
    return this.state;
  }

  /**
   * Get queued message count
   */
  getQueuedMessageCount(): number {
    return this.messageQueue.length;
  }

  /**
   * Create WebSocket connection
   */
  private createWebSocket(): void {
    try {
      this.ws = new WebSocket(this.options.url, this.options.protocols);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.setState('connected');
        this.flushMessageQueue();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onerror = () => {
        this.emitError(new Error('WebSocket error'));
      };

      this.ws.onclose = (event) => {
        this.handleClose(event);
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(err);
      this.handleError();
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: MessageEvent): void {
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
            console.error(`[WebSocketClient] Error in subscriber callback:`, error);
          }
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(new Error(`Failed to parse message: ${err.message}`));
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(event: CloseEvent): void {
    this.ws = null;

    // Normal closure (code 1000) or if reconnect disabled, stay disconnected
    if (event.code === 1000 || !this.options.reconnect?.enabled || this.state === 'disconnected') {
      this.setState('disconnected');
      return;
    }

    // Otherwise, attempt reconnection
    this.scheduleReconnect();
  }

  /**
   * Handle connection error
   */
  private handleError(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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
      this.createWebSocket();
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
   * Send message immediately
   */
  private sendImmediate(envelope: FluxEnvelope): void {
    try {
      const data = JSON.stringify(envelope);
      this.ws!.send(data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(new Error(`Failed to send message: ${err.message}`));

      // Re-queue message for retry
      this.messageQueue.push(envelope);
    }
  }

  /**
   * Flush queued messages on reconnection
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach((envelope) => {
      this.sendImmediate(envelope);
    });
  }

  /**
   * Update and notify state change
   */
  private setState(newState: WebSocketConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach((callback) => {
        try {
          callback(newState);
        } catch (error) {
          console.error('[WebSocketClient] Error in state listener:', error);
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
        console.error('[WebSocketClient] Error in error listener:', err);
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
