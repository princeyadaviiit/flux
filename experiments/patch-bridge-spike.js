/**
 * Phase 0 Spike: JSON Patch → Yjs PatchBridge Validation
 *
 * Goal: Prove that JSON Patch operations can be reliably translated to Yjs
 * operations with correct CRDT convergence under concurrent edits.
 *
 * Per TRD §4.2: JSON Patch is the wire format for expressing intent;
 * Yjs is the conflict resolution layer.
 */

import * as Y from 'yjs';

/**
 * PatchBridge: Translates JSON Patch operations to Yjs mutations
 */
class PatchBridge {
  constructor(ydoc) {
    this.ydoc = ydoc;
    this.root = ydoc.getMap('root');
  }

  /**
   * Apply a JSON Patch operation to the Yjs document
   * @param {Object} op - JSON Patch operation {op, path, value, from}
   */
  applyPatch(op) {
    this.ydoc.transact(() => {
      switch (op.op) {
        case 'add':
          this._applyAdd(op);
          break;
        case 'remove':
          this._applyRemove(op);
          break;
        case 'replace':
          this._applyReplace(op);
          break;
        case 'move':
          this._applyMove(op);
          break;
        case 'copy':
          this._applyCopy(op);
          break;
        default:
          throw new Error(`Unknown operation: ${op.op}`);
      }
    });
  }

  /**
   * Navigate to a path in the Yjs document
   * Returns {parent, key} for the final segment
   */
  _navigateToPath(path) {
    const segments = path.split('/').filter(s => s !== '');
    let current = this.root;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];

      if (current instanceof Y.Map) {
        if (!current.has(segment)) {
          // Auto-create intermediate structures
          current.set(segment, new Y.Map());
        }
        current = current.get(segment);
      } else if (current instanceof Y.Array) {
        const index = parseInt(segment, 10);
        current = current.get(index);
      }
    }

    const finalKey = segments[segments.length - 1];
    return { parent: current, key: finalKey };
  }

  /**
   * Get value at path
   */
  _getAtPath(path) {
    const segments = path.split('/').filter(s => s !== '');
    let current = this.root;

    for (const segment of segments) {
      if (current instanceof Y.Map) {
        current = current.get(segment);
      } else if (current instanceof Y.Array) {
        current = current.get(parseInt(segment, 10));
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * JSON Patch 'add' → Y.Map.set or Y.Array.insert
   */
  _applyAdd(op) {
    const { parent, key } = this._navigateToPath(op.path);

    if (parent instanceof Y.Map) {
      parent.set(key, this._wrapValue(op.value));
    } else if (parent instanceof Y.Array) {
      const index = key === '-' ? parent.length : parseInt(key, 10);
      parent.insert(index, [this._wrapValue(op.value)]);
    }
  }

  /**
   * JSON Patch 'remove' → Y.Map.delete or Y.Array.delete
   */
  _applyRemove(op) {
    const { parent, key } = this._navigateToPath(op.path);

    if (parent instanceof Y.Map) {
      parent.delete(key);
    } else if (parent instanceof Y.Array) {
      parent.delete(parseInt(key, 10), 1);
    }
  }

  /**
   * JSON Patch 'replace' → Y.Map.set (LWW semantics)
   */
  _applyReplace(op) {
    const { parent, key } = this._navigateToPath(op.path);

    if (parent instanceof Y.Map) {
      parent.set(key, this._wrapValue(op.value));
    } else if (parent instanceof Y.Array) {
      const index = parseInt(key, 10);
      parent.delete(index, 1);
      parent.insert(index, [this._wrapValue(op.value)]);
    }
  }

  /**
   * JSON Patch 'move' → decomposed into remove + add
   */
  _applyMove(op) {
    const value = this._getAtPath(op.from);
    this._applyRemove({ op: 'remove', path: op.from });
    this._applyAdd({ op: 'add', path: op.path, value });
  }

  /**
   * JSON Patch 'copy' → decomposed into read + add
   */
  _applyCopy(op) {
    const value = this._getAtPath(op.from);
    this._applyAdd({ op: 'add', path: op.path, value });
  }

  /**
   * Wrap primitive values, create Y.Map/Y.Array for objects/arrays
   */
  _wrapValue(value) {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      const yarray = new Y.Array();
      yarray.push(value.map(v => this._wrapValue(v)));
      return yarray;
    }

    const ymap = new Y.Map();
    for (const [k, v] of Object.entries(value)) {
      ymap.set(k, this._wrapValue(v));
    }
    return ymap;
  }

  /**
   * Convert Yjs structure to plain JSON
   */
  toJSON() {
    return this._unwrapValue(this.root);
  }

  _unwrapValue(value) {
    if (value instanceof Y.Map) {
      const obj = {};
      value.forEach((v, k) => {
        obj[k] = this._unwrapValue(v);
      });
      return obj;
    }

    if (value instanceof Y.Array) {
      return value.toArray().map(v => this._unwrapValue(v));
    }

    return value;
  }
}

/**
 * Test Suite: Concurrent Edit Scenarios
 */

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    return false;
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();

  if (keysA.length !== keysB.length) return false;
  if (keysA.join(',') !== keysB.join(',')) return false;

  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

function assertEqual(actual, expected, message = '') {
  if (!deepEqual(actual, expected)) {
    const actualStr = JSON.stringify(actual, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);
    throw new Error(`${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
  }
}

// Test 1: Basic operations
test('Basic add operation', () => {
  const doc = new Y.Doc();
  const bridge = new PatchBridge(doc);

  bridge.applyPatch({ op: 'add', path: '/name', value: 'Alice' });

  assertEqual(bridge.toJSON(), { name: 'Alice' });
});

test('Basic replace operation', () => {
  const doc = new Y.Doc();
  const bridge = new PatchBridge(doc);

  bridge.applyPatch({ op: 'add', path: '/name', value: 'Alice' });
  bridge.applyPatch({ op: 'replace', path: '/name', value: 'Bob' });

  assertEqual(bridge.toJSON(), { name: 'Bob' });
});

test('Basic remove operation', () => {
  const doc = new Y.Doc();
  const bridge = new PatchBridge(doc);

  bridge.applyPatch({ op: 'add', path: '/name', value: 'Alice' });
  bridge.applyPatch({ op: 'remove', path: '/name' });

  assertEqual(bridge.toJSON(), {});
});

test('Nested object operations', () => {
  const doc = new Y.Doc();
  const bridge = new PatchBridge(doc);

  bridge.applyPatch({ op: 'add', path: '/user', value: { name: 'Alice', age: 30 } });
  bridge.applyPatch({ op: 'replace', path: '/user/age', value: 31 });

  assertEqual(bridge.toJSON(), { user: { name: 'Alice', age: 31 } });
});

test('Array operations', () => {
  const doc = new Y.Doc();
  const bridge = new PatchBridge(doc);

  bridge.applyPatch({ op: 'add', path: '/items', value: ['a', 'b'] });
  bridge.applyPatch({ op: 'add', path: '/items/-', value: 'c' });

  assertEqual(bridge.toJSON(), { items: ['a', 'b', 'c'] });
});

// Test 2: Concurrent edits - different paths (should both survive)
test('Concurrent edits to different paths converge', () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  const bridgeA = new PatchBridge(docA);
  const bridgeB = new PatchBridge(docB);

  // Initial sync
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  // Both clients add different fields concurrently
  bridgeA.applyPatch({ op: 'add', path: '/name', value: 'Alice' });
  bridgeB.applyPatch({ op: 'add', path: '/age', value: 30 });

  // Sync updates
  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);

  Y.applyUpdate(docB, updateA);
  Y.applyUpdate(docA, updateB);

  // Both should converge to the same state
  const resultA = bridgeA.toJSON();
  const resultB = bridgeB.toJSON();

  assertEqual(resultA, resultB, 'Documents should converge');
  assertEqual(resultA, { name: 'Alice', age: 30 }, 'Both changes should be present');
});

// Test 3: Concurrent edits - same path (LWW semantics)
test('Concurrent replace on same path uses LWW', () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  const bridgeA = new PatchBridge(docA);
  const bridgeB = new PatchBridge(docB);

  // Initial state
  bridgeA.applyPatch({ op: 'add', path: '/status', value: 'draft' });
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  // Both clients replace the same field
  bridgeA.applyPatch({ op: 'replace', path: '/status', value: 'published' });
  bridgeB.applyPatch({ op: 'replace', path: '/status', value: 'archived' });

  // Sync
  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);

  Y.applyUpdate(docB, updateA);
  Y.applyUpdate(docA, updateB);

  // Both should converge (LWW - one wins, but they agree)
  const resultA = bridgeA.toJSON();
  const resultB = bridgeB.toJSON();

  assertEqual(resultA, resultB, 'Documents should converge to same state');
  console.log(`  Converged to: ${JSON.stringify(resultA)}`);
});

// Test 4: Complex concurrent scenario
test('Complex concurrent edits converge correctly', () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const docC = new Y.Doc();

  const bridgeA = new PatchBridge(docA);
  const bridgeB = new PatchBridge(docB);
  const bridgeC = new PatchBridge(docC);

  // Initial state
  bridgeA.applyPatch({ op: 'add', path: '/document', value: { title: 'Draft', sections: [] } });
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
  Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA));

  // Three clients make different changes
  bridgeA.applyPatch({ op: 'replace', path: '/document/title', value: 'Final' });
  bridgeB.applyPatch({ op: 'add', path: '/document/author', value: 'Alice' });
  bridgeC.applyPatch({ op: 'add', path: '/document/version', value: 2 });

  // Full mesh sync
  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);
  const updateC = Y.encodeStateAsUpdate(docC);

  Y.applyUpdate(docB, updateA);
  Y.applyUpdate(docB, updateC);

  Y.applyUpdate(docC, updateA);
  Y.applyUpdate(docC, updateB);

  Y.applyUpdate(docA, updateB);
  Y.applyUpdate(docA, updateC);

  // All three should converge
  const resultA = bridgeA.toJSON();
  const resultB = bridgeB.toJSON();
  const resultC = bridgeC.toJSON();

  assertEqual(resultA, resultB, 'DocA and DocB should match');
  assertEqual(resultB, resultC, 'DocB and DocC should match');

  // All changes should be present
  const expected = {
    document: {
      title: 'Final',
      sections: [],
      author: 'Alice',
      version: 2
    }
  };

  assertEqual(resultA, expected, 'All concurrent changes should be present');
});

// Test 5: Fuzzed concurrent edits
test('Fuzzed concurrent operations converge', () => {
  const operations = [
    { op: 'add', path: '/field1', value: 'value1' },
    { op: 'add', path: '/field2', value: 'value2' },
    { op: 'replace', path: '/field1', value: 'updated1' },
    { op: 'add', path: '/nested', value: { a: 1, b: 2 } },
    { op: 'replace', path: '/nested/a', value: 10 },
  ];

  const docA = new Y.Doc();
  const docB = new Y.Doc();

  const bridgeA = new PatchBridge(docA);
  const bridgeB = new PatchBridge(docB);

  // Apply different subsets of operations to each doc
  bridgeA.applyPatch(operations[0]);
  bridgeA.applyPatch(operations[1]);
  bridgeA.applyPatch(operations[3]);

  bridgeB.applyPatch(operations[2]);
  bridgeB.applyPatch(operations[3]);
  bridgeB.applyPatch(operations[4]);

  // Sync
  const updateA = Y.encodeStateAsUpdate(docA);
  const updateB = Y.encodeStateAsUpdate(docB);

  Y.applyUpdate(docB, updateA);
  Y.applyUpdate(docA, updateB);

  const resultA = bridgeA.toJSON();
  const resultB = bridgeB.toJSON();

  assertEqual(resultA, resultB, 'Fuzzed operations should converge');
});

// Run all tests
console.log('\n=== Phase 0 Spike: PatchBridge Validation ===\n');

const results = [
  test('Basic add operation', () => {
    const doc = new Y.Doc();
    const bridge = new PatchBridge(doc);
    bridge.applyPatch({ op: 'add', path: '/name', value: 'Alice' });
    assertEqual(bridge.toJSON(), { name: 'Alice' });
  }),

  test('Basic replace operation', () => {
    const doc = new Y.Doc();
    const bridge = new PatchBridge(doc);
    bridge.applyPatch({ op: 'add', path: '/name', value: 'Alice' });
    bridge.applyPatch({ op: 'replace', path: '/name', value: 'Bob' });
    assertEqual(bridge.toJSON(), { name: 'Bob' });
  }),

  test('Basic remove operation', () => {
    const doc = new Y.Doc();
    const bridge = new PatchBridge(doc);
    bridge.applyPatch({ op: 'add', path: '/name', value: 'Alice' });
    bridge.applyPatch({ op: 'remove', path: '/name' });
    assertEqual(bridge.toJSON(), {});
  }),

  test('Nested object operations', () => {
    const doc = new Y.Doc();
    const bridge = new PatchBridge(doc);
    bridge.applyPatch({ op: 'add', path: '/user', value: { name: 'Alice', age: 30 } });
    bridge.applyPatch({ op: 'replace', path: '/user/age', value: 31 });
    assertEqual(bridge.toJSON(), { user: { name: 'Alice', age: 31 } });
  }),

  test('Array operations', () => {
    const doc = new Y.Doc();
    const bridge = new PatchBridge(doc);
    bridge.applyPatch({ op: 'add', path: '/items', value: ['a', 'b'] });
    bridge.applyPatch({ op: 'add', path: '/items/-', value: 'c' });
    assertEqual(bridge.toJSON(), { items: ['a', 'b', 'c'] });
  }),

  test('Concurrent edits to different paths converge', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const bridgeA = new PatchBridge(docA);
    const bridgeB = new PatchBridge(docB);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    bridgeA.applyPatch({ op: 'add', path: '/name', value: 'Alice' });
    bridgeB.applyPatch({ op: 'add', path: '/age', value: 30 });
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docB, updateA);
    Y.applyUpdate(docA, updateB);
    const resultA = bridgeA.toJSON();
    const resultB = bridgeB.toJSON();
    assertEqual(resultA, resultB, 'Documents should converge');
    assertEqual(resultA, { name: 'Alice', age: 30 }, 'Both changes should be present');
  }),

  test('Concurrent replace on same path uses LWW', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const bridgeA = new PatchBridge(docA);
    const bridgeB = new PatchBridge(docB);
    bridgeA.applyPatch({ op: 'add', path: '/status', value: 'draft' });
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    bridgeA.applyPatch({ op: 'replace', path: '/status', value: 'published' });
    bridgeB.applyPatch({ op: 'replace', path: '/status', value: 'archived' });
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docB, updateA);
    Y.applyUpdate(docA, updateB);
    const resultA = bridgeA.toJSON();
    const resultB = bridgeB.toJSON();
    assertEqual(resultA, resultB, 'Documents should converge to same state');
    console.log(`  Converged to: ${JSON.stringify(resultA)}`);
  }),

  test('Complex concurrent edits converge correctly', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const docC = new Y.Doc();
    const bridgeA = new PatchBridge(docA);
    const bridgeB = new PatchBridge(docB);
    const bridgeC = new PatchBridge(docC);
    bridgeA.applyPatch({ op: 'add', path: '/document', value: { title: 'Draft', sections: [] } });
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA));
    bridgeA.applyPatch({ op: 'replace', path: '/document/title', value: 'Final' });
    bridgeB.applyPatch({ op: 'add', path: '/document/author', value: 'Alice' });
    bridgeC.applyPatch({ op: 'add', path: '/document/version', value: 2 });
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);
    const updateC = Y.encodeStateAsUpdate(docC);
    Y.applyUpdate(docB, updateA);
    Y.applyUpdate(docB, updateC);
    Y.applyUpdate(docC, updateA);
    Y.applyUpdate(docC, updateB);
    Y.applyUpdate(docA, updateB);
    Y.applyUpdate(docA, updateC);
    const resultA = bridgeA.toJSON();
    const resultB = bridgeB.toJSON();
    const resultC = bridgeC.toJSON();
    assertEqual(resultA, resultB, 'DocA and DocB should match');
    assertEqual(resultB, resultC, 'DocB and DocC should match');
    const expected = {
      document: {
        title: 'Final',
        sections: [],
        author: 'Alice',
        version: 2
      }
    };
    assertEqual(resultA, expected, 'All concurrent changes should be present');
  }),

  test('Fuzzed concurrent operations converge', () => {
    const operations = [
      { op: 'add', path: '/field1', value: 'value1' },
      { op: 'add', path: '/field2', value: 'value2' },
      { op: 'replace', path: '/field1', value: 'updated1' },
      { op: 'add', path: '/nested', value: { a: 1, b: 2 } },
      { op: 'replace', path: '/nested/a', value: 10 },
    ];
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const bridgeA = new PatchBridge(docA);
    const bridgeB = new PatchBridge(docB);
    bridgeA.applyPatch(operations[0]);
    bridgeA.applyPatch(operations[1]);
    bridgeA.applyPatch(operations[3]);
    bridgeB.applyPatch(operations[2]);
    bridgeB.applyPatch(operations[3]);
    bridgeB.applyPatch(operations[4]);
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docB, updateA);
    Y.applyUpdate(docA, updateB);
    const resultA = bridgeA.toJSON();
    const resultB = bridgeB.toJSON();
    assertEqual(resultA, resultB, 'Fuzzed operations should converge');
  })
];

const passed = results.filter(r => r).length;
const total = results.length;

console.log(`\n=== Results: ${passed}/${total} tests passed ===\n`);

if (passed === total) {
  console.log('✓ PatchBridge validation SUCCESSFUL');
  console.log('✓ JSON Patch → Yjs translation is sound');
  console.log('✓ Concurrent edits converge correctly');
  console.log('\nDecision: Proceed with PatchBridge design from TRD §4.2');
} else {
  console.log('✗ PatchBridge validation FAILED');
  console.log('✗ Design needs revision before Phase 2');
}
