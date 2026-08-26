/**
 * SSEServer - Server-Sent Events server implementation
 * Per TRD §4.1: Agent→Client streaming via SSE
 */

import { IncomingMessage, ServerResponse } from 'http';
import { FluxEnvelope, FluxEventType } from './protocol';

export interface SSEServerOptions {
  /** Path to handle SSE connections (default: '/events') */
  path?: string;

  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;

  /** Enable CORS (default: false) */
  cors?: boolean;

  /** Allowed origins for CORS */
  allowedOrigins?: string[];
}

export interface SSEConnection {
  /** Connection ID */
  id: string;

  /** Client's last event ID for resume */
  lastEventId?: string;

  /** Send envelope to this connection */
  send: (envelope: FluxEnvelope) => void;

  /** Close this connection */
  close: () => void;

  /** Check if connection is still open */
  isOpen: () => boolean;
}

/**
 * SSE Server for streaming events to clients
 */
export class SSEServer {
  private connections = new Map<string, ServerResponse>();
  private sequences = new Map<string, number>();
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();
  private eventHistory = new Map<string, FluxEnvelope[]>();

  private options: Required<SSEServerOptions>;

  constructor(options: SSEServerOptions = {}) {
    this.options = {
      path: options.path ?? '/events',
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      cors: options.cors ?? false,
      allowedOrigins: options.allowedOrigins ?? ['*'],
    };
  }

  /**
   * Handle incoming HTTP request
   * Call this from your HTTP server's request handler
   */
  handleRequest(req: IncomingMessage, res: ServerResponse): boolean {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Check if this request is for SSE endpoint
    if (url.pathname !== this.options.path) {
      return false;
    }

    // Only accept GET requests
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Allow': 'GET' });
      res.end();
      return true;
    }

    // Set up SSE connection
    this.setupConnection(req, res, url);
    return true;
  }

  /**
   * Set up SSE connection
   */
  private setupConnection(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const connectionId = this.generateConnectionId();
    const lastEventId = url.searchParams.get('lastEventId') || undefined;

    // Set SSE headers
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    };

    // Add CORS headers if enabled
    if (this.options.cors) {
      const origin = req.headers.origin || '*';
      if (this.isOriginAllowed(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
    }

    res.writeHead(200, headers);

    // Store connection
    this.connections.set(connectionId, res);
    this.sequences.set(connectionId, 0);

    // If client provided lastEventId, replay missed events
    if (lastEventId) {
      this.replayEvents(connectionId, lastEventId);
    }

    // Send initial comment to establish connection
    this.writeRaw(res, ': connected\n\n');

    // Set up heartbeat
    this.startHeartbeat(connectionId);

    // Handle client disconnect
    req.on('close', () => {
      this.removeConnection(connectionId);
    });
  }

  /**
   * Broadcast envelope to all connections
   */
  broadcast(envelope: FluxEnvelope): void {
    this.connections.forEach((res, connectionId) => {
      this.sendToConnection(connectionId, envelope);
    });
  }

  /**
   * Send envelope to specific connection
   */
  sendToConnection(connectionId: string, envelope: FluxEnvelope): void {
    const res = this.connections.get(connectionId);
    if (!res) {
      console.warn(`[SSEServer] Connection ${connectionId} not found`);
      return;
    }

    try {
      // Format SSE message
      const id = envelope.id;
      const data = JSON.stringify(envelope);

      this.writeRaw(res, `id: ${id}\n`);
      this.writeRaw(res, `data: ${data}\n\n`);

      // Store in history for replay
      const history = this.eventHistory.get(connectionId) || [];
      history.push(envelope);

      // Keep last 100 events per connection
      if (history.length > 100) {
        history.shift();
      }

      this.eventHistory.set(connectionId, history);
    } catch (error) {
      console.error(`[SSEServer] Error sending to ${connectionId}:`, error);
      this.removeConnection(connectionId);
    }
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
  closeConnection(connectionId: string): void {
    const res = this.connections.get(connectionId);
    if (res) {
      res.end();
      this.removeConnection(connectionId);
    }
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.connections.forEach((res, connectionId) => {
      res.end();
      this.removeConnection(connectionId);
    });
  }

  /**
   * Write raw data to response
   */
  private writeRaw(res: ServerResponse, data: string): void {
    res.write(data);
  }

  /**
   * Start heartbeat for connection
   */
  private startHeartbeat(connectionId: string): void {
    const timer = setInterval(() => {
      const res = this.connections.get(connectionId);
      if (!res) {
        clearInterval(timer);
        return;
      }

      try {
        // Send comment as heartbeat
        this.writeRaw(res, ': heartbeat\n\n');
      } catch (error) {
        console.error(`[SSEServer] Heartbeat failed for ${connectionId}:`, error);
        this.removeConnection(connectionId);
      }
    }, this.options.heartbeatInterval);

    this.heartbeatTimers.set(connectionId, timer);
  }

  /**
   * Replay events after lastEventId
   */
  private replayEvents(connectionId: string, lastEventId: string): void {
    const history = this.eventHistory.get(connectionId);
    if (!history) return;

    // Find index of lastEventId
    const lastIndex = history.findIndex((env) => env.id === lastEventId);
    if (lastIndex === -1) {
      // Last event not found in history, can't replay
      console.warn(`[SSEServer] Cannot replay from ${lastEventId} - not in history`);
      return;
    }

    // Replay events after lastEventId
    const eventsToReplay = history.slice(lastIndex + 1);
    eventsToReplay.forEach((envelope) => {
      this.sendToConnection(connectionId, envelope);
    });
  }

  /**
   * Remove connection and cleanup
   */
  private removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
    this.sequences.delete(connectionId);
    this.eventHistory.delete(connectionId);

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
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
}
