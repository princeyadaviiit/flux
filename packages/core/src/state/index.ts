/**
 * State Synchronization Module
 *
 * Exports FluxStore and PatchBridge for CRDT-based state management.
 */

export { FluxStore } from './FluxStore';
export type { FluxStoreConfig, StateSnapshot, StateObserver } from './FluxStore';

export { PatchBridge } from './PatchBridge';
export type { PatchBridgeConfig } from './PatchBridge';
