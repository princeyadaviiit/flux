/**
 * State Synchronization Integration Example
 *
 * Demonstrates complete state sync workflow:
 * - Client sends JSON Patch via WebSocket
 * - Server applies to FluxStore (Yjs)
 * - Server broadcasts Yjs updates via SSE
 * - Client applies updates to local FluxStore
 * - CRDT ensures convergence under concurrent edits
 */

import { createServer } from 'http';
import { SSEServer } from '../transport/SSEServer';
import { FluxWebSocketServer } from '../transport/WebSocketServer';
import { FluxEnvelopeFactory } from '../transport/protocol';
import { FluxStore } from './FluxStore';
import * as Y from 'yjs';

// ========== SERVER SIDE ==========

const PORT = 3001;

// Server-side authoritative state store
const serverStore = new FluxStore({
  initialState: {
    users: [],
    settings: { theme: 'light', notifications: true },
    messages: [],
  },
});

console.log('[Server] Initial state:', serverStore.getState());

// Subscribe to state changes to broadcast updates
serverStore.observe((snapshot) => {
  console.log('[Server] State changed:', snapshot.state);
});

// Create HTTP server
const server = createServer((req, res) => {
  if (sseServer.handleRequest(req, res)) {
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// Initialize SSE for broadcasting state updates
const sseServer = new SSEServer({
  path: '/events',
  cors: true,
  allowedOrigins: ['*'],
});

// Initialize WebSocket for receiving patches from clients
const wsServer = new FluxWebSocketServer({
  server: server as any,
  path: '/ws',
  cors: true,
  allowedOrigins: ['*'],
});

// Track sequence numbers
const sequences = new Map<string, number>();

// Handle incoming patches from clients
wsServer.onMessage((envelope, connectionId) => {
  console.log(`[Server] Received from ${connectionId}:`, envelope.type);

  if (envelope.type === 'state.patch') {
    try {
      // Apply patches to server store
      serverStore.applyPatches(envelope.payload.ops);

      console.log('[Server] Patches applied successfully');

      // Get Yjs update that represents the change
      const stateVector = Y.encodeStateVector(serverStore.getYDoc());
      const update = Y.encodeStateAsUpdate(serverStore.getYDoc(), new Uint8Array());

      // Broadcast state update to all clients via SSE
      const seq = (sequences.get('broadcast') || 0) + 1;
      sequences.set('broadcast', seq);

      const updateEnvelope = FluxEnvelopeFactory.stateUpdate(
        `update-${seq}`,
        seq,
        {
          update: Array.from(update),
          stateVector: Array.from(stateVector),
        }
      );

      sseServer.broadcast(updateEnvelope);

      // Send acknowledgment to sender via SSE
      const ackSeq = (sequences.get(connectionId) || 0) + 1;
      sequences.set(connectionId, ackSeq);

      const ack = FluxEnvelopeFactory.textDelta(
        `ack-${envelope.id}`,
        ackSeq,
        { delta: 'Patch applied successfully' }
      );

      sseServer.sendToConnection(connectionId, ack);
    } catch (error) {
      console.error('[Server] Error applying patches:', error);

      // Send error to client
      const seq = (sequences.get(connectionId) || 0) + 1;
      sequences.set(connectionId, seq);

      const errorEnvelope = FluxEnvelopeFactory.error(
        `error-${envelope.id}`,
        seq,
        {
          code: 'PATCH_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: {},
        }
      );

      sseServer.sendToConnection(connectionId, errorEnvelope);
    }
  }
});

// Handle new connections
wsServer.onConnect((connectionId) => {
  console.log(`[Server] Client connected: ${connectionId}`);

  // Send current state to new client
  const snapshot = serverStore.getSnapshot();

  const seq = (sequences.get(connectionId) || 0) + 1;
  sequences.set(connectionId, seq);

  const initialState = FluxEnvelopeFactory.stateUpdate(
    `initial-${connectionId}`,
    seq,
    {
      update: Array.from(Y.encodeStateAsUpdate(serverStore.getYDoc())),
      stateVector: Array.from(snapshot.stateVector),
    }
  );

  // Small delay to ensure SSE connection is ready
  setTimeout(() => {
    sseServer.sendToConnection(connectionId, initialState);
  }, 100);
});

// Handle disconnections
wsServer.onDisconnect((connectionId) => {
  console.log(`[Server] Client disconnected: ${connectionId}`);
  sequences.delete(connectionId);
});

// Start server
server.listen(PORT, () => {
  console.log(`\n🚀 Flux State Sync Server running on http://localhost:${PORT}`);
  console.log(`   SSE endpoint: http://localhost:${PORT}/events`);
  console.log(`   WebSocket endpoint: ws://localhost:${PORT}/ws\n`);
});

// Demo: Server makes periodic changes
let counter = 0;
setInterval(() => {
  counter++;

  serverStore.applyPatches([
    {
      op: 'add',
      path: `/messages/${serverStore.getState().messages.length}`,
      value: {
        id: counter,
        text: `Server message ${counter}`,
        timestamp: Date.now(),
      },
    },
  ]);

  console.log(`[Server] Added message ${counter}`);
}, 5000);

// ========== CLIENT SIDE EXAMPLE ==========

/**
 * Client-side usage example
 *
 * ```typescript
 * import { FluxTransport } from '@flux/core/transport';
 * import { FluxStore } from '@flux/core/state';
 * import { FluxEnvelopeFactory } from '@flux/core/transport';
 *
 * // Create local store
 * const clientStore = new FluxStore();
 *
 * // Create transport
 * const transport = new FluxTransport({
 *   sseUrl: 'http://localhost:3001/events',
 *   wsUrl: 'ws://localhost:3001/ws',
 *   reconnect: true,
 * });
 *
 * // Subscribe to state updates from server
 * transport.on('state.update', (envelope) => {
 *   const { update } = envelope.payload;
 *
 *   // Apply Yjs update to local store
 *   clientStore.applyUpdate(new Uint8Array(update));
 *
 *   console.log('[Client] State synced:', clientStore.getState());
 * });
 *
 * // Subscribe to acknowledgments
 * transport.on('text.delta', (envelope) => {
 *   console.log('[Client] Server says:', envelope.payload.delta);
 * });
 *
 * // Handle errors
 * transport.on('error', (envelope) => {
 *   console.error('[Client] Error:', envelope.payload.message);
 * });
 *
 * // Observe local state changes
 * clientStore.observe((snapshot) => {
 *   console.log('[Client] Local state changed:', snapshot.state);
 * });
 *
 * // Connect
 * transport.connect();
 *
 * // ========== CLIENT ACTIONS ==========
 *
 * // Add a user (will be synced to server and other clients)
 * function addUser(name: string) {
 *   const patches = [
 *     {
 *       op: 'add' as const,
 *       path: `/users/${clientStore.getState().users.length}`,
 *       value: {
 *         id: Date.now(),
 *         name,
 *         online: true,
 *       },
 *     },
 *   ];
 *
 *   // Apply locally first (optimistic update)
 *   clientStore.applyPatches(patches);
 *
 *   // Send to server
 *   const envelope = FluxEnvelopeFactory.statePatch(
 *     `patch-${Date.now()}`,
 *     Date.now(),
 *     { ops: patches }
 *   );
 *
 *   transport.send(envelope);
 * }
 *
 * // Update settings
 * function updateSettings(theme: 'light' | 'dark') {
 *   const patches = [
 *     {
 *       op: 'replace' as const,
 *       path: '/settings/theme',
 *       value: theme,
 *     },
 *   ];
 *
 *   clientStore.applyPatches(patches);
 *
 *   const envelope = FluxEnvelopeFactory.statePatch(
 *     `patch-${Date.now()}`,
 *     Date.now(),
 *     { ops: patches }
 *   );
 *
 *   transport.send(envelope);
 * }
 *
 * // Example usage:
 * setTimeout(() => addUser('Alice'), 2000);
 * setTimeout(() => addUser('Bob'), 4000);
 * setTimeout(() => updateSettings('dark'), 6000);
 *
 * // ========== CONCURRENT EDIT SCENARIO ==========
 *
 * // Simulate two clients editing concurrently
 * // Both edit different paths - should converge
 * function simulateConcurrentEdits() {
 *   // Client 1 adds a user
 *   addUser('Client1User');
 *
 *   // Client 2 updates settings (happens concurrently)
 *   updateSettings('dark');
 *
 *   // CRDT ensures both changes are preserved and converged
 * }
 * ```
 */

// ========== STATE SYNC WORKFLOW ==========

/**
 * Complete state sync flow:
 *
 * 1. CLIENT MUTATION:
 *    - User action triggers local state change
 *    - Client applies patches to local FluxStore (optimistic update)
 *    - Client sends state.patch envelope via WebSocket
 *
 * 2. SERVER PROCESSING:
 *    - Server receives state.patch envelope
 *    - Server applies patches to authoritative FluxStore
 *    - Yjs resolves any conflicts with concurrent edits
 *    - Server gets Yjs update representing the change
 *
 * 3. BROADCAST:
 *    - Server broadcasts state.update envelope to all clients via SSE
 *    - Envelope contains Yjs update binary
 *
 * 4. CLIENT SYNC:
 *    - All clients receive state.update envelope
 *    - Clients apply Yjs update to local FluxStore
 *    - Yjs CRDT ensures convergence
 *    - Observers are notified of state change
 *
 * 5. CONVERGENCE:
 *    - All clients and server now have identical state
 *    - Concurrent edits are merged via CRDT semantics
 *    - No conflicts, no manual resolution needed
 *
 * CRITICAL INVARIANTS:
 * - All mutations go through PatchBridge (RULES.md §1.1)
 * - Server is authoritative source of truth
 * - Clients use optimistic updates for instant feedback
 * - Yjs handles all conflict resolution automatically
 */

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  serverStore.destroy();
  await wsServer.close();
  process.exit(0);
});
