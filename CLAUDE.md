# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**Flux is currently in the ideation/pre-alpha phase.** This repository contains comprehensive specification documents but no implementation code yet. The documents define a framework-agnostic library for building "Agentic AI-Native" web applications.

## What Flux Will Be

Flux solves three core problems when building LLM-powered interactive web apps:
1. **Streaming UI** — progressive rendering of LLM-generated UI as tokens arrive, without waiting for complete JSON
2. **Three-way state sync** — CRDT-based convergence between client UI, backend database, and agent context
3. **Safe autonomy** — human-in-the-loop approval gates for sensitive agent actions

## Core Architecture (When Implemented)

### Four Subsystems (all in `@flux/core`)

1. **Transport Layer** (`FluxTransport`)
   - SSE for agent→client streaming
   - WebSocket for client→agent bidirectional
   - Multiplexed event types via `FluxEnvelope` format
   - No head-of-line blocking between event types

2. **State Engine** (`FluxStore` + `PatchBridge`)
   - Yjs CRDT for conflict-free state convergence
   - JSON Patch (RFC 6902) as wire format for mutations
   - Critical: JSON Patch describes intent; Yjs resolves conflicts
   - All mutations MUST go through `PatchBridge` (see RULES.md §1.1)

3. **Generative UI Renderer** (`StreamingUIParser`)
   - Incremental JSON parser with repair heuristics
   - Progressive validation against partial schemas
   - **Security-critical**: ALL LLM-authored strings MUST pass through `sanitize()` before DOM (RULES.md §1.2)

4. **HITL Primitives** (`agent.pauseForApproval()`)
   - Signed, single-use approval tokens (HMAC-SHA256)
   - Execution genuinely halts until approval verified
   - Nonce invalidated immediately on any verification attempt

### Monorepo Structure (Planned)

```
@flux/core                    Core library (framework-agnostic TypeScript)
@flux/vue                     Vue 3 adapter
@flux/svelte                  Svelte adapter  
@flux/solid                   SolidJS adapter
@flux/cli                     Scaffolding tool (npm create flux@latest)
@flux/conformance-tests       Shared test suite for all adapters
```

**Package boundary rule**: Adapters depend only on `@flux/core`. Core never depends on adapters (RULES.md §3).

## Critical Architectural Invariants

From RULES.md §1 — these are non-negotiable:

1. **State mutations**: Route ALL through `PatchBridge`. No direct `Y.Doc` writes outside `@flux/core/state`.
2. **XSS prevention**: Every LLM string for HTML props MUST pass `sanitize()`. No alternate paths.
3. **Sensitive actions**: Must be allow-listed OR gated behind `pauseForApproval()` with verified token.
4. **Token replay**: Invalidate nonce immediately on verification attempt (success or failure).
5. **Framework independence**: Nothing under `@flux/core` may import Vue/Svelte/Solid/React.
6. **Adapter parity**: Adapters must pass `@flux/conformance-tests` before claiming support.
7. **Event ordering**: Use `seq` and `id`, never arrival order. Cross-type ordering not guaranteed.
8. **Protocol changes**: Update TRD.md in same PR that introduces new `FluxEventType`.

## Key Design Decisions

### Why JSON Patch + Yjs (not just one)?
- **JSON Patch**: Compact wire format, standard (RFC 6902), human-readable intent
- **Yjs**: Actual conflict resolution via CRDT semantics
- Flow: Client sends patch → `PatchBridge` translates to Yjs ops → Yjs resolves conflicts → broadcasts update

### Why SSE + WebSocket (not just WebSocket)?
- SSE: Better for unidirectional streams, automatic reconnect via `Last-Event-ID`
- WebSocket: Needed for client→server bidirectional
- Both wrapped in single `FluxTransport` API

### Why NOT React-first?
Strategic positioning: Target underserved Vue/Svelte/Solid ecosystems rather than head-on competition with CopilotKit/Vercel AI SDK (see PRD §7).

## Development Phases (from PHASES.md)

**Phase 0** (spike): Validate JSON Patch↔Yjs reconciliation and HMAC token scheme  
**Phase 1** (weeks 1-4): Transport layer  
**Phase 2** (weeks 5-8): State synchronization  
**Phase 3** (weeks 9-12): Generative renderer + adapters  
**Phase 4** (weeks 13-16): CLI, docs, launch  
**Phase 5** (post-v1): Hardening, ecosystem growth  

## Security Model (TRD §7)

**Threat model**:
- Prompt injection → malicious UI schema: Mitigated by rendering approval UI from trusted component LLM cannot author
- XSS via LLM text: Mandatory `sanitize()` enforced architecturally + lint rule
- Token replay: Single-use nonce + 120s TTL
- Agent bypassing HITL: Gated call path + static analysis in CI

## Reference Documents

- **PRD.md**: Product vision, functional requirements, personas
- **TRD.md**: Technical specifications, protocols, algorithms
- **ARCHITECTURE.md**: Component relationships, data flow
- **PHASES.md**: 16-week roadmap with dependencies
- **RULES.md**: Non-negotiable engineering constraints (READ THIS FIRST when coding)
- **IMPLEMENTATION.md**: Beginner-friendly walkthrough of concepts

## When Implementation Begins

1. Read **RULES.md** before touching `packages/core/src/state` or `packages/core/src/renderer`
2. Never weaken an architectural invariant to make a test pass
3. Conformance test failures are blocking, not follow-ups
4. Security-relevant changes require adversarial test case in same PR
5. Use conventional commits (`feat:`, `fix:`, `docs:`, etc.)
6. Branch naming: `phase-<n>/<description>` during initial build

## Technology Choices

- **Language**: TypeScript strict mode (no `any` without justification)
- **Monorepo**: Turborepo for incremental builds
- **State sync**: Yjs + JSON Patch
- **Sanitization**: DOMPurify
- **Testing**: Vitest (unit), Playwright (E2E), property-based for parser/state
- **Node version**: Assumes modern Node.js with native WebSocket/SSE support

## What NOT to Do

- Add dependencies without one-line justification in PR
- Log secrets (use envelope redaction hook)
- Use `eval`/`Function` for LLM output parsing
- Assume CSP allows `unsafe-eval`
- Skip updating TRD.md when changing protocols
- Create cross-package imports outside `index.ts` exports
