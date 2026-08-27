/**
 * WebSocketServer - WebSocket server for bidirectional communication
 * Per TRD §4.1: Client→Agent communication via WebSocket
 */

import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer as WSServer } from 'ws';
import { FluxEnvelope } from './protocol';

export interface WebSocketServerOptions {
  /** WebSocket server instance or port number */
  server?: WSServer | number;

  /** Path to handle WebSocket connections (default: '/ws') */
  path?: string;

  /** Enable CORS (default: false) */
  cors?: boolean;

  /** Allowed origins for CORS */
  allowedOrigins?: string[];

  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
}

export interface WebSocketConnection {
  /** Connection ID */
  id: string;

  /** Send envelope to this connection */
  send: (envelope: FluxEnvelope) => void;

  /** Close this connection */
  close: () => void;

  /** Check if connection is still open */
  isOpen: () => boolean;
}

type MessageHandler = (envelope: FluxEnvelope, connectionId: string) => void;
type ConnectionHandler = (connectionId: string) => void;
type ErrorHandler = (error: Error, connectionId?: string) => void;

/**
 * WebSocket Server for bidirectional communication
 */
export class FluxWebSocketServer {
  private wss: WSServer | null = null;
  private connections = new Map<string, WebSocket>();
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();

  private messageHandlers = new Set<MessageHandler>();
  private connectHandlers = new Set<ConnectionHandler>();
  private disconnectHandlers = new Set<ConnectionHandler>();
  private errorHandlers = new Set<ErrorHandler>();

  private options: Required<Omit<WebSocketServerOptions, 'server'>>;

  constructor(options: WebSocketServerOptions = {}) {
    this.options = {
      path: options.path ?? '/ws',
      cors: options.cors ?? false,
      allowedOrigins: options.allowedOrigins ?? ['*'],
      heartbeatInterval: options.heartbeatInterval ?? 30000,
    };

    // Initialize WebSocket server
    if (options.server) {
      if (typeof options.server === 'number') {
        this.wss = new WSServer({ port: options.server });
      } else {
        this.wss = options.server;
      }

      this.setupServer();
    }
  }

  /**
   * Initialize with existing WebSocket server instance
   */
  attach(wss: WSServer): void {
    if (this.wss) {
      throw new Error('Server already attached');
    }

    this.wss = wss;
    this.setupServer();
  }

  /**
   * Set up WebSocket server event handlers
   */
  private setupServer(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      // Check path if specified
      if (this.options.path && req.url !== this.options.path) {
        ws.close(1008, 'Invalid path');
        return;
      }

      // Check origin if CORS enabled
      if (this.options.cors) {
        const origin = req.headers.origin || '';
        if (!this.isOriginAllowed(origin)) {
          ws.close(1008, 'Origin not allowed');
          return;
        }
      }

      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error: Error) => {
      this.emitError(error);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const connectionId = this.generateConnectionId();

    // Store connection
    this.connections.set(connectionId, ws);

    // Set up message handler
    ws.on('message', (data: Buffer | string) => {
      this.handleMessage(connectionId, data);
    });

    // Set up close handler
    ws.on('close', () => {
      this.removeConnection(connectionId);
      this.emitDisconnect(connectionId);
    });

    // Set up error handler
    ws.on('error', (error: Error) => {
      this.emitError(error, connectionId);
    });

    // Set up pong handler for heartbeat
    ws.on('pong', () => {
      // Connection is alive, no action needed
    });

    // Start heartbeat
    this.startHeartbeat(connectionId);

    // Notify connection established
    this.emitConnect(connectionId);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(connectionId: string, data: Buffer | string): void {
    try {
      const message = data.toString();
      const envelope = JSON.parse(message) as FluxEnvelope;

      // Validate envelope structure
      if (!this.isValidEnvelope(envelope)) {
        throw new Error('Invalid envelope structure');
      }

      // Emit to message handlers
      this.messageHandlers.forEach((handler) => {
        try {
          handler(envelope, connectionId);
        } catch (error) {
          console.error('[WebSocketServer] Error in message handler:', error);
        }
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(new Error(`Failed to parse message: ${err.message}`), connectionId);
    }
  }

  /**
   * Subscribe to incoming messages
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to new connections
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  /**
   * Subscribe to disconnections
   */
  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  /**
   * Subscribe to errors
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Send envelope to specific connection
   */
  sendToConnection(connectionId: string, envelope: FluxEnvelope): void {
    const ws = this.connections.get(connectionId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WebSocketServer] Connection ${connectionId} not available`);
      return;
    }

    try {
      const data = JSON.stringify(envelope);
      ws.send(data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitError(new Error(`Failed to send: ${err.message}`), connectionId);
    }
  }

  /**
   * Broadcast envelope to all connections
   */
  broadcast(envelope: FluxEnvelope, excludeConnectionId?: string): void {
    this.connections.forEach((ws, connectionId) => {
      if (excludeConnectionId && connectionId === excludeConnectionId) {
        return;
      }
      this.sendToConnection(connectionId, envelope);
    });
  }

  /**
   * Get active connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get all connection IDs
   */
  getConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Close specific connection
   */
  closeConnection(connectionId: string, code: number = 1000, reason?: string): void {
    const ws = this.connections.get(connectionId);
    if (ws) {
      ws.close(code, reason);
      this.removeConnection(connectionId);
    }
  }

  /**
   * Close all connections and shut down server
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      // Close all connections
      this.connections.forEach((ws, connectionId) => {
        ws.close(1000, 'Server shutdown');
        this.removeConnection(connectionId);
      });

      // Close server
      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Start heartbeat for connection
   */
  private startHeartbeat(connectionId: string): void {
    const timer = setInterval(() => {
      const ws = this.connections.get(connectionId);
      if (!ws) {
        clearInterval(timer);
        return;
      }

      if (ws.readyState !== WebSocket.OPEN) {
        this.removeConnection(connectionId);
        return;
      }

      try {
        // Send ping
        ws.ping();
      } catch (error) {
        console.error(`[WebSocketServer] Heartbeat failed for ${connectionId}:`, error);
        this.removeConnection(connectionId);
      }
    }, this.options.heartbeatInterval);

    this.heartbeatTimers.set(connectionId, timer);
  }

  /**
   * Remove connection and cleanup
   */
  private removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);

    const timer = this.heartbeatTimers.get(connectionId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(connectionId);
    }
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if origin is allowed
   */
  private isOriginAllowed(origin: string): boolean {
    if (this.options.allowedOrigins.includes('*')) {
      return true;
    }
    return this.options.allowedOrigins.includes(origin);
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

  /**
   * Emit connect event
   */
  private emitConnect(connectionId: string): void {
    this.connectHandlers.forEach((handler) => {
      try {
        handler(connectionId);
      } catch (error) {
        console.error('[WebSocketServer] Error in connect handler:', error);
      }
    });
  }

  /**
   * Emit disconnect event
   */
  private emitDisconnect(connectionId: string): void {
    this.disconnectHandlers.forEach((handler) => {
      try {
        handler(connectionId);
      } catch (error) {
        console.error('[WebSocketServer] Error in disconnect handler:', error);
      }
    });
  }

  /**
   * Emit error event
   */
  private emitError(error: Error, connectionId?: string): void {
    this.errorHandlers.forEach((handler) => {
      try {
        handler(error, connectionId);
      } catch (err) {
        console.error('[WebSocketServer] Error in error handler:', err);
      }
    });
  }
}
