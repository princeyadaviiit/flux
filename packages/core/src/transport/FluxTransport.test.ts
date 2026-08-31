/**
 * FluxTransport Integration Tests
 * Tests the unified transport API combining SSE and WebSocket
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FluxTransport } from './FluxTransport';
import { FluxEnvelopeFactory } from './protocol';

describe('FluxTransport', () => {
  let transport: FluxTransport;

  beforeEach(() => {
    // Mock WebSocket and EventSource in Node environment
    global.WebSocket = vi.fn() as any;
    global.EventSource = vi.fn() as any;
  });

  afterEach(() => {
    if (transport) {
      transport.disconnect();
    }
  });

  describe('Initialization', () => {
    it('should create transport with SSE and WebSocket URLs', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
      });

      expect(transport).toBeDefined();
      expect(transport.getState().state).toBe('disconnected');
    });

    it('should accept custom reconnect settings', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
        reconnect: false,
      });

      expect(transport).toBeDefined();
    });

    it('should accept lastEventId for resumption', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
        lastEventId: 'event-123',
      });

      expect(transport).toBeDefined();
    });
  });

  describe('Connection State', () => {
    it('should start in disconnected state', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
      });

      const state = transport.getState();
      expect(state.state).toBe('disconnected');
      expect(state.sseState).toBe('disconnected');
      expect(state.wsState).toBe('disconnected');
    });

    it('should provide state query methods', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
      });

      expect(transport.isConnected()).toBe(false);
      expect(transport.isConnecting()).toBe(false);
      expect(transport.isReconnecting()).toBe(false);
    });
  });

  describe('Event Subscription', () => {
    it('should allow subscribing to specific event types', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
      });

      const callback = vi.fn();
      const unsubscribe = transport.on('text.delta', callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow subscribing to state changes', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
      });

      const callback = vi.fn();
      transport.onStateChange(callback);

      // Should be called immediately with current state
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'disconnected',
        })
      );
    });

    it('should allow subscribing to errors', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
      });

      const callback = vi.fn();
      const unsubscribe = transport.onError(callback);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('Sending Messages', () => {
    it('should send envelopes via WebSocket', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
      });

      const envelope = FluxEnvelopeFactory.statePatch('msg-1', 1, {
        ops: [{ op: 'add', path: '/name', value: 'Alice' }],
      });

      // Should queue message when not connected
      expect(() => transport.send(envelope)).not.toThrow();
    });
  });

  describe('Resumption', () => {
    it('should preserve lastEventId for resumption', () => {
      transport = new FluxTransport({
        sseUrl: 'http://localhost:3000/events',
        wsUrl: 'ws://localhost:3000/ws',
        lastEventId: 'event-456',
      });

      const state = transport.getState();
      expect(state.lastEventId).toBe('event-456');
    });
  });
});

describe('Protocol Envelopes', () => {
  describe('FluxEnvelopeFactory', () => {
    it('should create text.delta envelope', () => {
      const envelope = FluxEnvelopeFactory.textDelta('msg-1', 1, {
        delta: 'Hello',
      });

      expect(envelope.type).toBe('text.delta');
      expect(envelope.id).toBe('msg-1');
      expect(envelope.seq).toBe(1);
      expect(envelope.payload.delta).toBe('Hello');
      expect(envelope.ts).toBeGreaterThan(0);
    });

    it('should create ui.schema.delta envelope', () => {
      const envelope = FluxEnvelopeFactory.uiSchemaDelta('msg-2', 2, {
        delta: '{"component":"Card"',
        componentId: 'card-1',
      });

      expect(envelope.type).toBe('ui.schema.delta');
      expect(envelope.payload.componentId).toBe('card-1');
    });

    it('should create state.patch envelope', () => {
      const envelope = FluxEnvelopeFactory.statePatch('msg-3', 3, {
        ops: [
          { op: 'add', path: '/name', value: 'Alice' },
          { op: 'replace', path: '/age', value: 30 },
        ],
      });

      expect(envelope.type).toBe('state.patch');
      expect(envelope.payload.ops).toHaveLength(2);
    });

    it('should create approval.request envelope', () => {
      const envelope = FluxEnvelopeFactory.approvalRequest('msg-4', 4, {
        actionId: 'delete-user-123',
        summary: 'Delete user account',
        nonce: 'abc123',
        expiresAt: Date.now() + 120000,
      });

      expect(envelope.type).toBe('approval.request');
      expect(envelope.payload.actionId).toBe('delete-user-123');
    });

    it('should create error envelope', () => {
      const envelope = FluxEnvelopeFactory.error('msg-5', 5, {
        message: 'Connection failed',
        code: 'CONNECTION_ERROR',
      });

      expect(envelope.type).toBe('error');
      expect(envelope.payload.message).toBe('Connection failed');
    });

    it('should create ping envelope', () => {
      const envelope = FluxEnvelopeFactory.ping('msg-6', 6);

      expect(envelope.type).toBe('ping');
      expect(envelope.payload).toBeDefined();
    });
  });
});

describe('Multiplexing', () => {
  it('should handle multiple event types independently', () => {
    const transport = new FluxTransport({
      sseUrl: 'http://localhost:3000/events',
      wsUrl: 'ws://localhost:3000/ws',
    });

    const textCallback = vi.fn();
    const uiCallback = vi.fn();
    const stateCallback = vi.fn();

    transport.on('text.delta', textCallback);
    transport.on('ui.schema.delta', uiCallback);
    transport.on('state.update', stateCallback);

    // Each event type has independent subscription
    expect(textCallback).not.toHaveBeenCalled();
    expect(uiCallback).not.toHaveBeenCalled();
    expect(stateCallback).not.toHaveBeenCalled();

    transport.disconnect();
  });
});
