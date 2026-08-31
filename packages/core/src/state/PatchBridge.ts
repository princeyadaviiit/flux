/**
 * PatchBridge - JSON Patch to Yjs Operation Translator
 *
 * Translates RFC 6902 JSON Patch operations into Yjs CRDT operations.
 * This is the ONLY entry point for state mutations in Flux (RULES.md §1.1).
 *
 * Key Design:
 * - JSON Patch describes INTENT (what change user/agent wants)
 * - Yjs resolves CONFLICTS (how concurrent edits merge)
 * - PatchBridge translates between these two layers
 *
 * Validated in Phase 0 spike: experiments/patch-bridge-spike.js
 */

import * as Y from 'yjs';
import type { Operation } from 'fast-json-patch';

export interface PatchBridgeConfig {
  /**
   * Root Y.Map name in the Y.Doc.
   * Defaults to "state".
   */
  rootMapName?: string;
}

/**
 * PatchBridge translates JSON Patch operations to Yjs operations.
 *
 * Translation table:
 * - add: Y.Map.set() or Y.Array.insert()
 * - remove: Y.Map.delete() or Y.Array.delete()
 * - replace: Y.Map.set() or Y.Array element replacement
 * - move: Array delete + insert
 * - copy: Read source + write to destination
 * - test: Read and compare (no mutation)
 *
 * Path format: JSON Pointer (RFC 6901)
 * - "/users/0/name" → root.users[0].name
 * - "/settings/theme" → root.settings.theme
 * - "" → root (special case)
 */
export class PatchBridge {
  private doc: Y.Doc;
  private rootMapName: string;

  constructor(doc: Y.Doc, config: PatchBridgeConfig = {}) {
    this.doc = doc;
    this.rootMapName = config.rootMapName || 'state';
  }

  /**
   * Apply array of JSON Patch operations to Yjs document.
   * All operations execute in single Yjs transaction for atomicity.
   *
   * @param patches - RFC 6902 JSON Patch operations
   * @throws {Error} If patch application fails
   */
  applyPatches(patches: Operation[]): void {
    this.doc.transact(() => {
      for (const patch of patches) {
        this.applyOperation(patch);
      }
    });
  }

  /**
   * Apply single JSON Patch operation.
   *
   * @param op - JSON Patch operation
   * @throws {Error} If operation is invalid or path doesn't exist
   */
  private applyOperation(op: Operation): void {
    switch (op.op) {
      case 'add':
        this.applyAdd(op.path, op.value);
        break;
      case 'remove':
        this.applyRemove(op.path);
        break;
      case 'replace':
        this.applyReplace(op.path, op.value);
        break;
      case 'move':
        this.applyMove(op.from, op.path);
        break;
      case 'copy':
        this.applyCopy(op.from, op.path);
        break;
      case 'test':
        this.applyTest(op.path, op.value);
        break;
      default:
        throw new Error(`Unknown operation: ${(op as any).op}`);
    }
  }

  // ========== OPERATION IMPLEMENTATIONS ==========

  private applyAdd(path: string, value: any): void {
    const { parent, key, isArray } = this.resolvePath(path, false);

    if (!parent) {
      throw new Error(`Cannot add to root path: ${path}`);
    }

    // Validate parent is a container, not a primitive
    if (!(parent instanceof Y.Map) && !(parent instanceof Y.Array)) {
      // Extract parent path for error message
      const parts = path.split('/').filter(p => p.length > 0);
      const parentPath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';
      throw new Error(`Cannot navigate through primitive value at: ${parentPath}`);
    }

    if (isArray) {
      const arr = parent as Y.Array<any>;
      const index = parseInt(key, 10);

      if (index === arr.length) {
        // Append to end
        arr.push([this.jsonToYjs(value)]);
      } else if (index >= 0 && index < arr.length) {
        // Insert at index
        arr.insert(index, [this.jsonToYjs(value)]);
      } else {
        throw new Error(`Invalid array index for add: ${path}`);
      }
    } else {
      const map = parent as Y.Map<any>;
      map.set(key, this.jsonToYjs(value));
    }
  }

  private applyRemove(path: string): void {
    const { parent, key, isArray } = this.resolvePath(path, true);

    if (!parent) {
      throw new Error(`Cannot remove root path: ${path}`);
    }

    if (isArray) {
      const arr = parent as Y.Array<any>;
      const index = parseInt(key, 10);

      if (index >= 0 && index < arr.length) {
        arr.delete(index, 1);
      } else {
        throw new Error(`Invalid array index for remove: ${path}`);
      }
    } else {
      const map = parent as Y.Map<any>;

      if (!map.has(key)) {
        throw new Error(`Key does not exist for remove: ${path}`);
      }

      map.delete(key);
    }
  }

  private applyReplace(path: string, value: any): void {
    const { parent, key, isArray } = this.resolvePath(path, true);

    if (!parent) {
      throw new Error(`Cannot replace root path: ${path}`);
    }

    if (isArray) {
      const arr = parent as Y.Array<any>;
      const index = parseInt(key, 10);

      if (index >= 0 && index < arr.length) {
        // Delete old value and insert new one
        arr.delete(index, 1);
        arr.insert(index, [this.jsonToYjs(value)]);
      } else {
        throw new Error(`Invalid array index for replace: ${path}`);
      }
    } else {
      const map = parent as Y.Map<any>;

      if (!map.has(key)) {
        throw new Error(`Key does not exist for replace: ${path}`);
      }

      map.set(key, this.jsonToYjs(value));
    }
  }

  private applyMove(from: string, to: string): void {
    // Read value at source
    const { parent: fromParent, key: fromKey, isArray: fromIsArray } = this.resolvePath(from, true);

    if (!fromParent) {
      throw new Error(`Cannot move from root: ${from}`);
    }

    let value: any;

    if (fromIsArray) {
      const arr = fromParent as Y.Array<any>;
      const index = parseInt(fromKey, 10);
      value = arr.get(index);
    } else {
      const map = fromParent as Y.Map<any>;
      value = map.get(fromKey);
    }

    // Convert to JSON BEFORE removing (to preserve the value)
    const jsonValue = this.yjsToJSON(value);

    // Remove from source
    this.applyRemove(from);

    // Add to destination
    this.applyAdd(to, jsonValue);
  }

  private applyCopy(from: string, to: string): void {
    // Read value at source (no removal)
    const { parent: fromParent, key: fromKey, isArray: fromIsArray } = this.resolvePath(from, true);

    if (!fromParent) {
      throw new Error(`Cannot copy from root: ${from}`);
    }

    let value: any;

    if (fromIsArray) {
      const arr = fromParent as Y.Array<any>;
      const index = parseInt(fromKey, 10);
      value = arr.get(index);
    } else {
      const map = fromParent as Y.Map<any>;
      value = map.get(fromKey);
    }

    // Add to destination
    this.applyAdd(to, this.yjsToJSON(value));
  }

  private applyTest(path: string, expectedValue: any): void {
    const { parent, key, isArray } = this.resolvePath(path, true);

    let actualValue: any;

    if (!parent) {
      // Test root
      const rootMap = this.doc.getMap(this.rootMapName);
      actualValue = this.yjsToJSON(rootMap);
    } else if (isArray) {
      const arr = parent as Y.Array<any>;
      const index = parseInt(key, 10);
      actualValue = this.yjsToJSON(arr.get(index));
    } else {
      const map = parent as Y.Map<any>;
      actualValue = this.yjsToJSON(map.get(key));
    }

    if (!this.deepEqual(actualValue, expectedValue)) {
      throw new Error(`Test failed at ${path}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
    }
  }

  // ========== PATH RESOLUTION ==========

  /**
   * Resolve JSON Pointer path to parent Yjs container and key.
   *
   * @param path - JSON Pointer path (e.g., "/users/0/name")
   * @param mustExist - If true, throw if path doesn't exist
   * @returns Parent container, key, and whether parent is array
   */
  private resolvePath(
    path: string,
    mustExist: boolean
  ): { parent: Y.Map<any> | Y.Array<any> | null; key: string; isArray: boolean } {
    if (path === '') {
      return { parent: null, key: '', isArray: false };
    }

    const parts = path.split('/').filter(p => p.length > 0);

    if (parts.length === 0) {
      return { parent: null, key: '', isArray: false };
    }

    let current: any = this.doc.getMap(this.rootMapName);

    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];

      if (current instanceof Y.Map) {
        if (mustExist && !current.has(part)) {
          throw new Error(`Path does not exist: ${path} (missing: ${part})`);
        }
        current = current.get(part);

        // Check if we got a primitive value when we still have more path to navigate
        if (i < parts.length - 2 && !(current instanceof Y.Map) && !(current instanceof Y.Array)) {
          throw new Error(`Cannot navigate through primitive value at: /${parts.slice(0, i + 1).join('/')}`);
        }
      } else if (current instanceof Y.Array) {
        const index = parseInt(part, 10);
        if (isNaN(index) || index < 0 || index >= current.length) {
          throw new Error(`Invalid array index in path: ${path} (index: ${part})`);
        }
        current = current.get(index);

        // Check if we got a primitive value when we still have more path to navigate
        if (i < parts.length - 2 && !(current instanceof Y.Map) && !(current instanceof Y.Array)) {
          throw new Error(`Cannot navigate through primitive value at: /${parts.slice(0, i + 1).join('/')}`);
        }
      } else {
        throw new Error(`Cannot navigate through primitive value at: /${parts.slice(0, i).join('/')}`);
      }
    }

    const key = parts[parts.length - 1];
    const isArray = current instanceof Y.Array;

    return { parent: current, key, isArray };
  }

  // ========== CONVERSION HELPERS ==========

  /**
   * Convert plain JSON to Yjs representation.
   */
  private jsonToYjs(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      const yArray = new Y.Array();
      yArray.push(value.map(item => this.jsonToYjs(item)));
      return yArray;
    }

    if (typeof value === 'object') {
      const yMap = new Y.Map();
      for (const [k, v] of Object.entries(value)) {
        yMap.set(k, this.jsonToYjs(v));
      }
      return yMap;
    }

    return value;
  }

  /**
   * Convert Yjs representation to plain JSON.
   */
  private yjsToJSON(value: any): any {
    if (value instanceof Y.Map) {
      const obj: Record<string, any> = {};
      value.forEach((v, k) => {
        obj[k] = this.yjsToJSON(v);
      });
      return obj;
    }

    if (value instanceof Y.Array) {
      return value.toArray().map(item => this.yjsToJSON(item));
    }

    return value;
  }

  /**
   * Deep equality check for test operation.
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a === null || b === null || a === undefined || b === undefined) {
      return a === b;
    }

    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, i) => this.deepEqual(item, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a).sort();
      const keysB = Object.keys(b).sort();

      if (keysA.length !== keysB.length) return false;
      if (!keysA.every((k, i) => k === keysB[i])) return false;

      return keysA.every(k => this.deepEqual(a[k], b[k]));
    }

    return false;
  }
}
