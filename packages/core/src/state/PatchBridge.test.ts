/**
 * PatchBridge Unit Tests
 *
 * Tests for JSON Patch to Yjs translation including:
 * - All JSON Patch operations (add, remove, replace, move, copy, test)
 * - Path resolution with nested objects and arrays
 * - Error handling for invalid operations
 * - CRDT convergence under concurrent edits
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchBridge } from './PatchBridge';
import * as Y from 'yjs';

describe('PatchBridge', () => {
  let doc: Y.Doc;
  let bridge: PatchBridge;
  let rootMap: Y.Map<any>;

  beforeEach(() => {
    doc = new Y.Doc();
    bridge = new PatchBridge(doc);
    rootMap = doc.getMap('state');
  });

  // Helper to get current state as JSON
  const getState = (): any => {
    const result: any = {};
    rootMap.forEach((value, key) => {
      result[key] = yjsToJSON(value);
    });
    return result;
  };

  const yjsToJSON = (value: any): any => {
    if (value instanceof Y.Map) {
      const obj: any = {};
      value.forEach((v, k) => {
        obj[k] = yjsToJSON(v);
      });
      return obj;
    }
    if (value instanceof Y.Array) {
      return value.toArray().map(yjsToJSON);
    }
    return value;
  };

  describe('Add Operation', () => {
    it('should add property to object', () => {
      bridge.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
      ]);

      expect(getState()).toEqual({ name: 'Alice' });
    });

    it('should add nested property', () => {
      bridge.applyPatches([
        { op: 'add', path: '/user', value: {} },
        { op: 'add', path: '/user/name', value: 'Alice' },
        { op: 'add', path: '/user/age', value: 30 },
      ]);

      expect(getState()).toEqual({
        user: { name: 'Alice', age: 30 },
      });
    });

    it('should append to array', () => {
      bridge.applyPatches([
        { op: 'add', path: '/items', value: [] },
        { op: 'add', path: '/items/0', value: 'first' },
        { op: 'add', path: '/items/1', value: 'second' },
      ]);

      expect(getState().items).toEqual(['first', 'second']);
    });

    it('should insert into array at index', () => {
      bridge.applyPatches([
        { op: 'add', path: '/items', value: ['a', 'c'] },
        { op: 'add', path: '/items/1', value: 'b' },
      ]);

      expect(getState().items).toEqual(['a', 'b', 'c']);
    });

    it('should handle complex nested structures', () => {
      bridge.applyPatches([
        {
          op: 'add',
          path: '/data',
          value: {
            users: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' },
            ],
            settings: { theme: 'dark', lang: 'en' },
          },
        },
      ]);

      const state = getState();
      expect(state.data.users).toHaveLength(2);
      expect(state.data.users[0].name).toBe('Alice');
      expect(state.data.settings.theme).toBe('dark');
    });
  });

  describe('Remove Operation', () => {
    it('should remove property from object', () => {
      bridge.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
        { op: 'add', path: '/age', value: 30 },
        { op: 'remove', path: '/age' },
      ]);

      expect(getState()).toEqual({ name: 'Alice' });
    });

    it('should remove array element', () => {
      bridge.applyPatches([
        { op: 'add', path: '/items', value: ['a', 'b', 'c'] },
        { op: 'remove', path: '/items/1' },
      ]);

      expect(getState().items).toEqual(['a', 'c']);
    });

    it('should throw when removing non-existent key', () => {
      expect(() => {
        bridge.applyPatches([{ op: 'remove', path: '/nonexistent' }]);
      }).toThrow('does not exist');
    });

    it('should throw when removing with invalid array index', () => {
      bridge.applyPatches([
        { op: 'add', path: '/items', value: ['a', 'b'] },
      ]);

      expect(() => {
        bridge.applyPatches([{ op: 'remove', path: '/items/5' }]);
      }).toThrow('Invalid array index');
    });
  });

  describe('Replace Operation', () => {
    it('should replace object property value', () => {
      bridge.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
        { op: 'replace', path: '/name', value: 'Bob' },
      ]);

      expect(getState().name).toBe('Bob');
    });

    it('should replace array element', () => {
      bridge.applyPatches([
        { op: 'add', path: '/items', value: ['a', 'b', 'c'] },
        { op: 'replace', path: '/items/1', value: 'X' },
      ]);

      expect(getState().items).toEqual(['a', 'X', 'c']);
    });

    it('should throw when replacing non-existent key', () => {
      expect(() => {
        bridge.applyPatches([{ op: 'replace', path: '/missing', value: 'test' }]);
      }).toThrow('does not exist');
    });
  });

  describe('Move Operation', () => {
    it('should move object property', () => {
      bridge.applyPatches([
        { op: 'add', path: '/oldKey', value: 'value' },
        { op: 'move', from: '/oldKey', path: '/newKey' },
      ]);

      const state = getState();
      expect(state.newKey).toBe('value');
      expect(state.oldKey).toBeUndefined();
    });

    it('should move array element', () => {
      bridge.applyPatches([
        { op: 'add', path: '/items', value: ['a', 'b', 'c'] },
        { op: 'move', from: '/items/0', path: '/items/2' },
      ]);

      expect(getState().items).toEqual(['b', 'c', 'a']);
    });

    it('should move nested structure', () => {
      bridge.applyPatches([
        { op: 'add', path: '/src', value: { nested: { data: 'test' } } },
        { op: 'move', from: '/src/nested', path: '/dest' },
      ]);

      const state = getState();
      expect(state.dest).toEqual({ data: 'test' });
      expect(state.src.nested).toBeUndefined();
    });
  });

  describe('Copy Operation', () => {
    it('should copy object property', () => {
      bridge.applyPatches([
        { op: 'add', path: '/original', value: 'value' },
        { op: 'copy', from: '/original', path: '/copy' },
      ]);

      const state = getState();
      expect(state.original).toBe('value');
      expect(state.copy).toBe('value');
    });

    it('should copy array element', () => {
      bridge.applyPatches([
        { op: 'add', path: '/items', value: ['a', 'b'] },
        { op: 'copy', from: '/items/0', path: '/items/2' },
      ]);

      expect(getState().items).toEqual(['a', 'b', 'a']);
    });

    it('should deep copy nested structure', () => {
      bridge.applyPatches([
        { op: 'add', path: '/original', value: { nested: { data: 'test' } } },
        { op: 'copy', from: '/original', path: '/copy' },
      ]);

      const state = getState();
      expect(state.copy).toEqual({ nested: { data: 'test' } });
      expect(state.original).toEqual({ nested: { data: 'test' } });
    });
  });

  describe('Test Operation', () => {
    it('should pass when value matches', () => {
      bridge.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
        { op: 'test', path: '/name', value: 'Alice' },
      ]);

      // Should not throw
      expect(getState().name).toBe('Alice');
    });

    it('should throw when value does not match', () => {
      bridge.applyPatches([
        { op: 'add', path: '/name', value: 'Alice' },
      ]);

      expect(() => {
        bridge.applyPatches([{ op: 'test', path: '/name', value: 'Bob' }]);
      }).toThrow('Test failed');
    });

    it('should test nested values', () => {
      bridge.applyPatches([
        { op: 'add', path: '/user', value: { name: 'Alice', age: 30 } },
        { op: 'test', path: '/user/name', value: 'Alice' },
      ]);

      // Should not throw
      expect(getState().user.name).toBe('Alice');
    });

    it('should test complex objects', () => {
      const complexValue = {
        items: [1, 2, 3],
        nested: { key: 'value' },
      };

      bridge.applyPatches([
        { op: 'add', path: '/data', value: complexValue },
        { op: 'test', path: '/data', value: complexValue },
      ]);

      // Should not throw
      expect(getState().data).toEqual(complexValue);
    });
  });

  describe('Batch Operations', () => {
    it('should apply multiple operations atomically', () => {
      bridge.applyPatches([
        { op: 'add', path: '/count', value: 0 },
        { op: 'replace', path: '/count', value: 1 },
        { op: 'replace', path: '/count', value: 2 },
        { op: 'replace', path: '/count', value: 3 },
      ]);

      expect(getState().count).toBe(3);
    });

    it('should handle complex multi-step transformations', () => {
      bridge.applyPatches([
        { op: 'add', path: '/users', value: [] },
        { op: 'add', path: '/users/0', value: { id: 1, name: 'Alice' } },
        { op: 'add', path: '/users/1', value: { id: 2, name: 'Bob' } },
        { op: 'add', path: '/users/2', value: { id: 3, name: 'Charlie' } },
        { op: 'remove', path: '/users/1' },
        { op: 'replace', path: '/users/0/name', value: 'Alicia' },
      ]);

      const state = getState();
      expect(state.users).toHaveLength(2);
      expect(state.users[0].name).toBe('Alicia');
      expect(state.users[1].name).toBe('Charlie');
    });
  });

  describe('Path Resolution Edge Cases', () => {
    it('should handle empty path segments correctly', () => {
      bridge.applyPatches([
        { op: 'add', path: '/a', value: { b: { c: 'value' } } },
      ]);

      expect(getState().a.b.c).toBe('value');
    });

    it('should throw on invalid path through primitive', () => {
      bridge.applyPatches([
        { op: 'add', path: '/value', value: 'string' },
      ]);

      expect(() => {
        bridge.applyPatches([{ op: 'add', path: '/value/nested', value: 'test' }]);
      }).toThrow('Cannot navigate through primitive');
    });
  });

  describe('CRDT Convergence via PatchBridge', () => {
    it('should converge when concurrent patches modify different paths', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      const bridge1 = new PatchBridge(doc1);
      const bridge2 = new PatchBridge(doc2);

      // Doc1 adds name
      bridge1.applyPatches([{ op: 'add', path: '/name', value: 'Alice' }]);

      // Doc2 adds age
      bridge2.applyPatches([{ op: 'add', path: '/age', value: 30 }]);

      // Sync updates
      const update1 = Y.encodeStateAsUpdate(doc1);
      const update2 = Y.encodeStateAsUpdate(doc2);

      Y.applyUpdate(doc1, update2);
      Y.applyUpdate(doc2, update1);

      // Extract states
      const state1: any = {};
      const state2: any = {};
      doc1.getMap('state').forEach((v, k) => (state1[k] = yjsToJSON(v)));
      doc2.getMap('state').forEach((v, k) => (state2[k] = yjsToJSON(v)));

      // Both should have both fields
      expect(state1).toEqual({ name: 'Alice', age: 30 });
      expect(state2).toEqual({ name: 'Alice', age: 30 });
    });

    it('should handle concurrent patches to same path with LWW', () => {
      const doc1 = new Y.Doc({ gc: false });
      const doc2 = new Y.Doc({ gc: false });
      doc1.clientID = 1;
      doc2.clientID = 2;

      const bridge1 = new PatchBridge(doc1);
      const bridge2 = new PatchBridge(doc2);

      // Both set same key to different values
      bridge1.applyPatches([{ op: 'add', path: '/value', value: 'from-doc1' }]);
      bridge2.applyPatches([{ op: 'add', path: '/value', value: 'from-doc2' }]);

      // Sync
      const update1 = Y.encodeStateAsUpdate(doc1);
      const update2 = Y.encodeStateAsUpdate(doc2);

      Y.applyUpdate(doc1, update2);
      Y.applyUpdate(doc2, update1);

      // Extract states
      const state1: any = {};
      const state2: any = {};
      doc1.getMap('state').forEach((v, k) => (state1[k] = yjsToJSON(v)));
      doc2.getMap('state').forEach((v, k) => (state2[k] = yjsToJSON(v)));

      // Both should converge to same value (LWW semantics)
      expect(state1.value).toBe(state2.value);
    });
  });

  describe('Type Preservation', () => {
    it('should preserve null values', () => {
      bridge.applyPatches([{ op: 'add', path: '/value', value: null }]);

      expect(getState().value).toBeNull();
    });

    it('should preserve boolean values', () => {
      bridge.applyPatches([
        { op: 'add', path: '/enabled', value: true },
        { op: 'add', path: '/disabled', value: false },
      ]);

      const state = getState();
      expect(state.enabled).toBe(true);
      expect(state.disabled).toBe(false);
    });

    it('should preserve number values', () => {
      bridge.applyPatches([
        { op: 'add', path: '/int', value: 42 },
        { op: 'add', path: '/float', value: 3.14 },
        { op: 'add', path: '/negative', value: -10 },
        { op: 'add', path: '/zero', value: 0 },
      ]);

      const state = getState();
      expect(state.int).toBe(42);
      expect(state.float).toBe(3.14);
      expect(state.negative).toBe(-10);
      expect(state.zero).toBe(0);
    });
  });
});
