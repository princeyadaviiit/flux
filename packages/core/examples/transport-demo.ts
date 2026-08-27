/**
 * Flux Transport Example - Complete SSE + WebSocket Demo
 *
 * This example demonstrates:
 * - Setting up SSE server for agent→client streaming
 * - Setting up WebSocket server for client→agent communication
 * - Using FluxTransport unified API on the client side
 * - Multiplexed event handling
 * - Reconnection and message queuing
 */

import { createServer } from 'http';
import { SSEServer } from '../src/transport/SSEServer';
import { FluxWebSocketServer } from '../src/transport/WebSocketServer';
import { FluxEnvelopeFactory } from '../src/transport/protocol';

// ========== SERVER SIDE ==========

const PORT = 3000;

// Create HTTP server
const server = createServer((req, res) => {
  // Handle SSE connections
  if (sseServer.handleRequest(req, res)) {
    return;
  }

  // Handle regular HTTP requests
  res.writeHead(404);
  res.end('Not found');
});

// Initialize SSE server for agent→client streaming
const sseServer = new SSEServer({
  path: '/events',
  cors: true,
  allowedOrigins: ['*'],
});

// Initialize WebSocket server for client→agent communication
const wsServer = new FluxWebSocketServer({
  server: server as any,
  path: '/ws',
  cors: true,
  allowedOrigins: ['*'],
});

// Track sequence numbers per connection
const sequences = new Map<string, number>();

// Handle incoming messages from clients via WebSocket
wsServer.onMessage((envelope, connectionId) => {
  console.log(`[Server] Received from ${connectionId}:`, envelope.type, envelope.payload);

  // Echo back acknowledgment via SSE
  const seq = (sequences.get(connectionId) || 0) + 1;
  sequences.set(connectionId, seq);

  const ack = FluxEnvelopeFactory.textDelta(
    `ack-${envelope.id}`,
    seq,
    { delta: `Received: ${envelope.type}` }
  );

  sseServer.sendToConnection(connectionId, ack);
});

// Handle new WebSocket connections
wsServer.onConnect((connectionId) => {
  console.log(`[Server] WebSocket connected: ${connectionId}`);
  sequences.set(connectionId, 0);
});

// Handle disconnections
wsServer.onDisconnect((connectionId) => {
  console.log(`[Server] WebSocket disconnected: ${connectionId}`);
  sequences.delete(connectionId);
});

// Simulate agent streaming text to all clients every 2 seconds
setInterval(() => {
  const seq = Date.now();
  const envelope = FluxEnvelopeFactory.textDelta(
    `text-${seq}`,
    seq,
    { delta: `Agent message at ${new Date().toISOString()}` }
  );

  console.log(`[Server] Broadcasting text delta to ${sseServer.getConnectionCount()} clients`);
  sseServer.broadcast(envelope);
}, 2000);

// Start server
server.listen(PORT, () => {
  console.log(`\n🚀 Flux Transport Server running on http://localhost:${PORT}`);
  console.log(`   SSE endpoint: http://localhost:${PORT}/events`);
  console.log(`   WebSocket endpoint: ws://localhost:${PORT}/ws\n`);
});

// ========== CLIENT SIDE EXAMPLE ==========

/**
 * Client-side usage example (would run in browser or Node with WebSocket/EventSource)
 *
 * ```typescript
 * import { FluxTransport } from '@flux/core/transport';
 *
 * // Create unified transport
 * const transport = new FluxTransport({
 *   sseUrl: 'http://localhost:3000/events',
 *   wsUrl: 'ws://localhost:3000/ws',
 *   reconnect: true,
 * });
 *
 * // Subscribe to agent text streams
 * transport.on('text.delta', (envelope) => {
 *   console.log('[Client] Received text:', envelope.payload.delta);
 * });
 *
 * // Subscribe to UI schema updates
 * transport.on('ui.schema.delta', (envelope) => {
 *   console.log('[Client] UI update:', envelope.payload);
 * });
 *
 * // Subscribe to state updates
 * transport.on('state.update', (envelope) => {
 *   console.log('[Client] State synced:', envelope.payload);
 * });
 *
 * // Monitor connection state
 * transport.onStateChange((state) => {
 *   console.log('[Client] Connection state:', state.state);
 *   console.log('  SSE:', state.sseState);
 *   console.log('  WebSocket:', state.wsState);
 * });
 *
 * // Handle errors
 * transport.onError((error, channel) => {
 *   console.error(`[Client] Error on ${channel}:`, error.message);
 * });
 *
 * // Connect both channels
 * transport.connect();
 *
 * // Send messages to agent
 * const sendUserAction = (action: string, data: any) => {
 *   const envelope = FluxEnvelopeFactory.statePatch(
 *     `action-${Date.now()}`,
 *     Date.now(),
 *     {
 *       ops: [
 *         { op: 'add', path: `/actions/${action}`, value: data }
 *       ]
 *     }
 *   );
 *
 *   transport.send(envelope);
 * };
 *
 * // Example: Send user input
 * sendUserAction('buttonClick', { buttonId: 'submit', timestamp: Date.now() });
 *
 * // Disconnect when done
 * // transport.disconnect();
 * ```
 */

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  await wsServer.close();
  process.exit(0);
});
