/**
 * @flux/core - Framework-agnostic core library
 *
 * Flux is a library for building Agentic AI-Native web applications.
 * This package provides the core primitives:
 * - Transport: Bidirectional SSE + WebSocket communication
 * - State: CRDT-based state synchronization with Yjs
 * - Renderer: Streaming JSON parser for generative UI
 * - HITL: Human-in-the-loop approval primitives
 *
 * @packageDocumentation
 */

// Transport layer
export * from './transport';

// Future exports (to be implemented in subsequent phases)
// export * from './state';      // Phase 2
// export * from './renderer';   // Phase 3
// export * from './hitl';       // Phase 3
