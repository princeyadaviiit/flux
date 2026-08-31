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

// Core subsystem exports
export * from './transport';
export * from './state';
export * from './renderer';
export * from './hitl';
