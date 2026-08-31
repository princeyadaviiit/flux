/**
 * FluxStore - CRDT-backed state store wrapping Yjs Y.Doc
 *
 * Provides JSON-like interface over Yjs CRDT with:
 * - Automatic conflict resolution via Yjs
 * - JSON Patch mutation API via PatchBridge
 * - Observable state changes
 * - Compact diff generation for agent context
 *
 * CRITICAL INVARIANT (RULES.md §1.1):
 * ALL state mutations MUST flow through PatchBridge.
 * Direct Y.Doc manipulation bypasses conflict resolution and breaks state sync.
 */

import * as Y from 'yjs';
import { PatchBridge } from './PatchBridge';
import type { Operation } from 'fast-json-patch';

export interface FluxStoreConfig {
  /**
   * Optional initial state as plain JSON object.
   * Converted to Yjs representation on store creation.
   */
  initialState?: Record<string, any>;

  /**
   * Optional client ID for Yjs awareness.
   * Used to track which client made which changes.
   */
  clientId?: string;
}

export interface StateSnapshot {
  /**
   * Current state as plain JSON object
   */
  state: Record<string, any>;

  /**
   * Yjs state vector for this snapshot.
   * Used for delta computation and conflict resolution.
   */
  stateVector: Uint8Array;

  /**
   * Timestamp when snapshot was taken
   */
  timestamp: number;
}

export type StateObserver = (snapshot: StateSnapshot) => void;

/**
 * FluxStore wraps Yjs Y.Doc to provide CRDT-backed state management
 * with JSON Patch mutation API.
 *
 * Schema mapping convention:
 * - Root Y.Map named "state" contains all application state
 * - Nested objects become nested Y.Map instances
 * - Arrays become Y.Array instances
 * - Primitives (string, number, boolean, null) stored directly
 *
 * All mutations go through PatchBridge to ensure proper CRDT semantics.
 */
export class FluxStore {
  private doc: Y.Doc;
  private bridge: PatchBridge;
  private stateMap: Y.Map<any>;
  private observers: Set<StateObserver> = new Set();

  constructor(config: FluxStoreConfig = {}) {
    // Initialize Yjs document
    this.doc = new Y.Doc();
    if (config.clientId) {
      this.doc.clientID = parseInt(config.clientId, 10) || this.doc.clientID;
    }

    // Get or create root state map
    this.stateMap = this.doc.getMap('state');

    // Initialize PatchBridge
    this.bridge = new PatchBridge(this.doc);

    // Set initial state if provided
    if (config.initialState) {
      this.setInitialState(config.initialState);
    }

    // Subscribe to Yjs updates
    this.doc.on('update', this.handleYjsUpdate);
  }

  /**
   * Apply JSON Patch operations to the store.
   * Operations are translated to Yjs operations via PatchBridge.
   *
   * @param patches - Array of JSON Patch operations (RFC 6902)
   * @throws {Error} If patch application fails
   */
  applyPatches(patches: Operation[]): void {
    this.bridge.applyPatches(patches);
  }

  /**
   * Get current state as plain JSON object.
   *
   * @returns Deep copy of current state
   */
  getState(): Record<string, any> {
    return this.yjsToJSON(this.stateMap);
  }

  /**
   * Get current state snapshot including state vector.
   * Used for diff computation and state synchronization.
   */
  getSnapshot(): StateSnapshot {
    return {
      state: this.getState(),
      stateVector: Y.encodeStateVector(this.doc),
      timestamp: Date.now(),
    };
  }

  /**
   * Apply Yjs update from remote peer.
   * Used to sync state changes from server or other clients.
   *
   * @param update - Yjs update binary (Uint8Array)
   */
  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update);
  }

  /**
   * Compute diff between this store and a remote state vector.
   * Returns minimal Yjs update containing only missing changes.
   *
   * Used to efficiently sync agent context with only new state changes.
   *
   * @param remoteStateVector - State vector from remote peer
   * @returns Yjs update containing missing changes
   */
  computeDiff(remoteStateVector: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, remoteStateVector);
  }

  /**
   * Subscribe to state changes.
   * Observer is called after every mutation with new snapshot.
   *
   * @param observer - Callback receiving state snapshots
   * @returns Unsubscribe function
   */
  observe(observer: StateObserver): () => void {
    this.observers.add(observer);

    // Call immediately with current state (wrapped in try-catch)
    try {
      observer(this.getSnapshot());
    } catch (error) {
      console.error('[FluxStore] Observer error:', error);
    }

    return () => {
      this.observers.delete(observer);
    };
  }

  /**
   * Get Yjs document for advanced use cases.
   *
   * WARNING: Direct Y.Doc manipulation bypasses PatchBridge and breaks
   * the architectural invariant (RULES.md §1.1). Only use for read-only
   * operations or when you need direct access to Yjs features.
   */
  getYDoc(): Y.Doc {
    return this.doc;
  }

  /**
   * Destroy store and clean up resources.
   * Call when store is no longer needed.
   */
  destroy(): void {
    this.doc.off('update', this.handleYjsUpdate);
    this.observers.clear();
    this.doc.destroy();
  }

  // ========== PRIVATE METHODS ==========

  private setInitialState(state: Record<string, any>): void {
    this.doc.transact(() => {
      for (const [key, value] of Object.entries(state)) {
        this.stateMap.set(key, this.jsonToYjs(value));
      }
    });
  }

  private handleYjsUpdate = (_update: Uint8Array, _origin: any): void => {
    // Notify observers of state change
    const snapshot = this.getSnapshot();

    for (const observer of this.observers) {
      try {
        observer(snapshot);
      } catch (error) {
        console.error('[FluxStore] Observer error:', error);
      }
    }
  };

  /**
   * Convert plain JSON to Yjs representation.
   * Objects → Y.Map, Arrays → Y.Array, primitives → direct values
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

    // Primitives: string, number, boolean
    return value;
  }

  /**
   * Convert Yjs representation back to plain JSON.
   * Y.Map → object, Y.Array → array, primitives → direct values
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

    // Primitives and null
    return value;
  }
}
