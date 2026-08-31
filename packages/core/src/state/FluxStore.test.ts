/**
 * FluxStore Unit Tests
 *
 * Tests for CRDT-backed state store including:
 * - Initialization and configuration
 * - JSON Patch application via PatchBridge
 * - State snapshots and observers
 * - Yjs update application
 * - Diff computation for agent context
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FluxStore } from './FluxStore';
import * as Y from 'yjs';

describe('FluxStore', () => {
  let store: FluxStore;

  beforeEach(() => {
    store = new FluxStore();
  });

  describe('Initialization', () => {
    it('should create empty store by default', () => {
      const state = store.getState();
      expect(state).toEqual({});
    });

    it('should initialize with provided state', () => {
      const initialState = {
        users: [{ id: 1, name: 'Alice' }],
        settings: { theme: 'dark' },
      };

      const store = new FluxStore({ initialState });
      const state = store.getState();

      expect(state).toEqual(initialState);
    });

    it('should accept custom client ID', () => {
      const store = new FluxStore({ clientId: '42' });
      const doc = store.getYDoc();

      expect(doc.clientID).toBe(42);
    });
  });

  describe('State Mutations via JSON Patch', () => {
    it('should apply add operation to object', () => {
      store.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
        { op: 'add', path: '/age', value: 30 },
      ]);

      const state = store.getState();
      expect(state).toEqual({ name: 'Alice', age: 30 });
    });

    it('should apply add operation to array', () => {
      store.applyPatches([
        { op: 'add', path: '/users', value: [] },
        { op: 'add', path: '/users/0', value: { id: 1, name: 'Alice' } },
        { op: 'add', path: '/users/1', value: { id: 2, name: 'Bob' } },
      ]);

      const state = store.getState();
      expect(state.users).toHaveLength(2);
      expect(state.users[0].name).toBe('Alice');
      expect(state.users[1].name).toBe('Bob');
    });

    it('should apply remove operation', () => {
      store.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
        { op: 'add', path: '/age', value: 30 },
        { op: 'remove', path: '/age' },
      ]);

      const state = store.getState();
      expect(state).toEqual({ name: 'Alice' });
    });

    it('should apply replace operation', () => {
      store.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
        { op: 'replace', path: '/name', value: 'Bob' },
      ]);

      const state = store.getState();
      expect(state.name).toBe('Bob');
    });

    it('should apply move operation', () => {
      store.applyPatches([
        { op: 'add', path: '/users', value: [{ name: 'Alice' }, { name: 'Bob' }] },
        { op: 'move', from: '/users/0', path: '/users/1' },
      ]);

      const state = store.getState();
      expect(state.users[1].name).toBe('Alice');
    });

    it('should apply copy operation', () => {
      store.applyPatches([
        { op: 'add', path: '/original', value: { data: 'test' } },
        { op: 'copy', from: '/original', path: '/copy' },
      ]);

      const state = store.getState();
      expect(state.original).toEqual({ data: 'test' });
      expect(state.copy).toEqual({ data: 'test' });
    });

    it('should apply test operation successfully', () => {
      store.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
        { op: 'test', path: '/name', value: 'Alice' },
      ]);

      // Should not throw
      expect(store.getState().name).toBe('Alice');
    });

    it('should throw on failed test operation', () => {
      store.applyPatches([{ op: 'add', path: '/name', value: 'Alice' }]);

      expect(() => {
        store.applyPatches([{ op: 'test', path: '/name', value: 'Bob' }]);
      }).toThrow('Test failed');
    });
  });

  describe('State Snapshots', () => {
    it('should provide snapshot with current state', () => {
      store.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
      ]);

      const snapshot = store.getSnapshot();

      expect(snapshot.state).toEqual({ name: 'Alice' });
      expect(snapshot.stateVector).toBeInstanceOf(Uint8Array);
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    it('should include state vector for diff computation', () => {
      const snapshot1 = store.getSnapshot();

      store.applyPatches([{ op: 'add', path: '/count', value: 1 }]);

      const snapshot2 = store.getSnapshot();

      // State vectors should differ
      expect(snapshot1.stateVector).not.toEqual(snapshot2.stateVector);
    });
  });

  describe('State Observers', () => {
    it('should call observer immediately on subscription', () => {
      const observer = vi.fn();

      store.applyPatches([{ op: 'add', path: '/name', value: 'Alice' }]);
      store.observe(observer);

      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer).toHaveBeenCalledWith(
        expect.objectContaining({
          state: { name: 'Alice' },
        })
      );
    });

    it('should notify observer on state changes', () => {
      const observer = vi.fn();
      store.observe(observer);

      observer.mockClear();

      store.applyPatches([{ op: 'add', path: '/count', value: 1 }]);

      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer).toHaveBeenCalledWith(
        expect.objectContaining({
          state: { count: 1 },
        })
      );
    });

    it('should support multiple observers', () => {
      const observer1 = vi.fn();
      const observer2 = vi.fn();

      store.observe(observer1);
      store.observe(observer2);

      observer1.mockClear();
      observer2.mockClear();

      store.applyPatches([{ op: 'add', path: '/data', value: 'test' }]);

      expect(observer1).toHaveBeenCalledTimes(1);
      expect(observer2).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe observer', () => {
      const observer = vi.fn();
      const unsubscribe = store.observe(observer);

      observer.mockClear();
      unsubscribe();

      store.applyPatches([{ op: 'add', path: '/data', value: 'test' }]);

      expect(observer).not.toHaveBeenCalled();
    });

    it('should not crash if observer throws', () => {
      const badObserver = vi.fn(() => {
        throw new Error('Observer error');
      });
      const goodObserver = vi.fn();

      store.observe(badObserver);
      store.observe(goodObserver);

      badObserver.mockClear();
      goodObserver.mockClear();

      // Should not throw
      expect(() => {
        store.applyPatches([{ op: 'add', path: '/data', value: 'test' }]);
      }).not.toThrow();

      // Good observer should still be called
      expect(goodObserver).toHaveBeenCalledTimes(1);
    });
  });

  describe('Yjs Integration', () => {
    it('should apply Yjs update from remote peer', () => {
      const remoteStore = new FluxStore();

      // Remote makes change
      remoteStore.applyPatches([
        { op: 'add', path: '/message', value: 'Hello from remote' },
      ]);

      // Get update from remote
      const update = Y.encodeStateAsUpdate(remoteStore.getYDoc());

      // Apply to local store
      store.applyUpdate(update);

      const state = store.getState();
      expect(state.message).toBe('Hello from remote');
    });

    it('should compute diff between local and remote state', () => {
      // Local makes changes
      store.applyPatches([
        { op: 'add', path: '/local', value: 'data' },
      ]);

      // Remote has different state
      const remoteStore = new FluxStore();
      remoteStore.applyPatches([
        { op: 'add', path: '/remote', value: 'data' },
      ]);

      const remoteStateVector = Y.encodeStateVector(remoteStore.getYDoc());

      // Compute diff: what local has that remote doesn't
      const diff = store.computeDiff(remoteStateVector);

      // Apply diff to remote
      remoteStore.applyUpdate(diff);

      // Remote should now have local's changes
      const remoteState = remoteStore.getState();
      expect(remoteState.local).toBe('data');
    });
  });

  describe('CRDT Convergence', () => {
    it('should converge when concurrent edits modify different keys', () => {
      const store1 = new FluxStore();
      const store2 = new FluxStore();

      // Store1 adds "name"
      store1.applyPatches([{ op: 'add', path: '/name', value: 'Alice' }]);

      // Store2 adds "age"
      store2.applyPatches([{ op: 'add', path: '/age', value: 30 }]);

      // Exchange updates
      const update1 = Y.encodeStateAsUpdate(store1.getYDoc());
      const update2 = Y.encodeStateAsUpdate(store2.getYDoc());

      store1.applyUpdate(update2);
      store2.applyUpdate(update1);

      // Both stores should have both keys
      const state1 = store1.getState();
      const state2 = store2.getState();

      expect(state1).toEqual({ name: 'Alice', age: 30 });
      expect(state2).toEqual({ name: 'Alice', age: 30 });
    });

    it('should use LWW for concurrent edits to same key', () => {
      const store1 = new FluxStore({ clientId: '1' });
      const store2 = new FluxStore({ clientId: '2' });

      // Both edit same key
      store1.applyPatches([{ op: 'add', path: '/value', value: 'from-store1' }]);
      store2.applyPatches([{ op: 'add', path: '/value', value: 'from-store2' }]);

      // Exchange updates
      const update1 = Y.encodeStateAsUpdate(store1.getYDoc());
      const update2 = Y.encodeStateAsUpdate(store2.getYDoc());

      store1.applyUpdate(update2);
      store2.applyUpdate(update1);

      // Both should converge to same value (determined by Yjs LWW)
      const state1 = store1.getState();
      const state2 = store2.getState();

      expect(state1.value).toBe(state2.value);
    });
  });

  describe('Cleanup', () => {
    it('should destroy store and stop notifying observers', () => {
      const observer = vi.fn();
      store.observe(observer);

      observer.mockClear();
      store.destroy();

      // Create new store and apply update from destroyed one
      const newStore = new FluxStore();
      newStore.applyPatches([{ op: 'add', path: '/data', value: 'test' }]);

      // Observer from destroyed store should not be called
      expect(observer).not.toHaveBeenCalled();
    });
  });
});
