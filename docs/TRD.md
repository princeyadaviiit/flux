# Flux — Technical Requirements Document (TRD)

**Project:** Flux
**Status:** Ideation / Pre-Alpha
**Document version:** 0.1 (Draft)
**Last updated:** August 24, 2026
**Related documents:** PRD.md · ARCHITECTURE.md · PHASES.md · RULES.md · IMPLEMENTATION.md · GUIDE.md

---

## 1. Purpose & Scope

This document specifies the technical requirements behind every functional requirement in PRD.md. Where PRD.md says *what* and *why*, this document says *how*, at the level of protocols, schemas, and algorithms. System-level component relationships live in ARCHITECTURE.md; this document focuses on the internal spec of each component.

## 2. System Overview

Flux consists of four cooperating subsystems, all implemented in `@flux/core` (Vanilla TypeScript) with thin reactive adapters per framework:

1. **Transport** — a unified, multiplexed SSE + WebSocket connection.
2. **State Engine** — a Yjs-backed CRDT store, mutated via a JSON Patch bridge.
3. **Renderer** — a streaming, error-tolerant JSON parser driving progressive UI rendering.
4. **HITL** — a pause/approve/resume primitive backed by signed, single-use tokens.

## 3. Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Core library | Vanilla TypeScript, strict mode | Framework independence; strict mode catches the partial/undefined-heavy states inherent to streaming data. |
| Monorepo management | Turborepo | Incremental builds/caching across many small packages (core + 3 adapters + CLI). |
| State synchronization | Yjs (CRDTs) + JSON Patch (RFC 6902) | Yjs supplies convergence guarantees; JSON Patch supplies a compact, standard wire format for expressing intended mutations (see §4.2 for how these compose). |
| Streaming & parsing | Fetch API / ReadableStream + custom partial JSON parser | No existing parser is tuned to Flux's incremental-schema-validation requirement (§4.3). |
| Testing | Vitest (unit), Playwright (E2E), plus a shared conformance suite | The conformance suite specifically guards against adapters silently diverging in behavior. |
| Ecosystem adapters | Vue, Svelte, SolidJS | Per PRD, deliberately non-React-first. |

## 4. Detailed Technical Requirements

### 4.1 Transport Layer

**Protocol.** Agent→client traffic rides Server-Sent Events; client→agent traffic rides a WebSocket. Both directions share one **envelope** format so a single multiplexer can route any event type without head-of-line blocking:

```ts
interface FluxEnvelope<T = unknown> {
  id: string;           // unique message id (ULID recommended)
  type: FluxEventType;  // discriminant — see table below
  seq: number;          // monotonically increasing sequence number per connection
  ts: number;            // server-side timestamp, ms epoch
  payload: T;
}

type FluxEventType =
  | "text.delta"
  | "ui.schema.delta"
  | "tool.call"
  | "tool.result"
  | "state.patch"       // client -> server, JSON Patch ops
  | "state.update"       // server -> client, Yjs update or derived patch
  | "approval.request"
  | "approval.token"
  | "error"
  | "ping";
```

**Multiplexing requirement.** Event types are demultiplexed client-side into independent subscriber queues keyed by `type`, so a long `text.delta` stream cannot delay an `approval.request`. This is enforced by processing each SSE `event:`-tagged frame independently rather than buffering the whole response.

**Reconnection.** SSE resumes via the `Last-Event-ID` header against `id`. WebSocket reconnects with capped exponential backoff (base 250ms, cap 8s, jitter ±20%). On reconnect, the client requests a state resync using a Yjs state vector (§4.2) rather than replaying the full event history.

**Ordering guarantee.** Ordering is only guaranteed *within* a single `type`, via `seq`. Cross-type ordering is intentionally not guaranteed — consumers needing causal ordering across types must encode a causal reference (e.g., a `tool.call`'s `id` referenced by its `tool.result`).

### 4.2 State Synchronization Engine

**The core design tension (and its resolution).** RFC 6902 JSON Patch has no built-in conflict-resolution semantics — it is an instruction list, not a merge algorithm. Yjs, a CRDT, *is* a merge algorithm. Flux does not use JSON Patch to resolve conflicts; it uses JSON Patch purely as the **wire format** for expressing "what a client thinks changed," and delegates all actual conflict resolution to Yjs. Concretely:

1. Client-side interaction produces one or more JSON Patch ops describing the intended change.
2. Ops are sent to the server as a `state.patch` envelope over the WebSocket.
3. The server's `PatchBridge` translates each op into the corresponding Yjs mutation, applied inside a single `ydoc.transact(...)` call:

| JSON Patch op | Yjs translation |
|---|---|
| `add` | `Y.Map.set(key, value)` or `Y.Array.insert(index, [value])` |
| `remove` | `Y.Map.delete(key)` or `Y.Array.delete(index, 1)` |
| `replace` | `Y.Map.set(key, value)` — last-write-wins at the leaf; concurrent replaces on the *same* leaf converge via Yjs's built-in LWW register, concurrent replaces on *different* leaves both survive |
| `move` | decomposed into `remove` + `add` within the same transaction |
| `copy` | decomposed into a local read + `add` |
| `test` | evaluated only against the client's local optimistic snapshot, and is **not** forwarded to the server — CRDT convergence makes server-side test-and-set unnecessary and, if forwarded, ambiguous under concurrent edits |

4. Yjs resolves any concurrency and emits an update. The server rebroadcasts the resulting Yjs update to other clients as `state.update`.
5. For the **agent's** context (which consumes text, not binary Yjs updates), the server derives a compact JSON-Patch-shaped diff by comparing before/after snapshots of the affected subtree, and injects only that diff into the next prompt — not the full state.

**Schema mapping convention.** Application state is modeled as a tree of `Y.Map` / `Y.Array` mirroring the JSON shape the app defines; primitive leaves use Yjs's built-in LWW register semantics, and any leaf explicitly modeled as free-form collaborative text should use `Y.Text` instead of a plain string (flagged in the app's state schema).

**Resume/resync.** On reconnect, the client sends its last known Yjs state vector (`Y.encodeStateVector`); the server responds with only the delta the client is missing (`Y.encodeStateAsUpdate(doc, clientStateVector)`), avoiding a full-state retransmit.

### 4.3 Generative UI Renderer

**Parsing algorithm.**
1. Maintain a growing text buffer per in-flight UI schema stream.
2. On each new token, attempt a strict `JSON.parse` of the buffer.
3. On failure, apply bounded repair heuristics in order: close any open string literal; close any open array/object brackets in reverse-open order; strip a trailing dangling comma. Re-attempt parse.
4. If a repaired parse succeeds, diff the resulting object against the last successfully emitted object for that stream and emit only changed props to the target component.
5. Structural fields (e.g., the `component`/`type` discriminant) must be complete and valid before any component is mounted; prop-level fields may arrive incrementally after mount.

**Schema validation.** Each registered component declares a schema (e.g., Zod). The renderer validates every incremental object against a *partial* form of that schema (all fields optional) so a not-yet-complete payload never fails validation prematurely; it validates against the *full* schema only once the parser judges the object structurally complete (no more incoming deltas for that id).

**Sanitization (mandatory, non-optional).** Any prop whose type is marked as "rich text/markup" in the component's schema is passed through a shared `sanitize()` utility (DOMPurify-backed) before being handed to the adapter. Adapters must not provide any code path that writes an unsanitized LLM-sourced string into `innerHTML`, `v-html`, or an equivalent. This is a hard architectural invariant — see RULES.md §1.

**Fallback behavior.** An unknown `component` discriminant, or a payload that still fails schema validation once judged "complete," renders a fallback/error component rather than throwing — required by FR-3.3.

### 4.4 Human-in-the-Loop (HITL) Primitives

**API surface (server-side):**

```ts
await agent.pauseForApproval({
  actionId: string;        // caller-supplied, unique per pending action
  summary: string;         // human-readable description shown in the Approval UI
  payload?: unknown;       // structured detail for a custom Approval UI
  ttlMs?: number;           // default 120_000
}): Promise<ApprovalResult>;
```

Calling this suspends the enclosing agent execution — the returned promise does not resolve until a token is verified or the TTL expires.

**Approval token.**

```ts
interface ApprovalToken {
  actionId: string;
  sessionId: string;
  nonce: string;         // server-issued, single use
  issuedAt: number;
  expiresAt: number;
  sig: string;            // HMAC-SHA256(sessionSecret, `${actionId}.${sessionId}.${nonce}.${issuedAt}.${expiresAt}`)
}
```

**v1 signing scheme:** HMAC-SHA256 using a per-session secret established at session authentication time and never sent to the client in raw form. The client's authenticated channel round-trips the server-issued `nonce`; the server performs the actual signing and verification. So "signed by the client" in the original product brief is realized as *"approved over an authenticated, session-bound channel and stamped with a server-verified, single-use token"* — the practical web equivalent of client-signed approval, without requiring browser-held private keys.

**v2 upgrade path (optional, post-v1):** Per-device asymmetric keys generated via WebCrypto (`crypto.subtle.generateKey`), enabling true client-side signing and non-repudiation, for teams with a stronger threat model.

**Replay protection:** each `nonce` is single-use and invalidated server-side immediately upon verification attempt (success or failure). Tokens carry a short default TTL (120s) to bound the exposure window.

**Execution guarantee:** verified via unit test — an action wrapped in `pauseForApproval()` must not have any observable side effect until the token is verified; this must hold even under process restarts (verified by persisting pending-approval state, not just holding it in memory).

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Latency | First partial UI paint within 150ms of the first sufficient token arriving (excludes network RTT). |
| Latency | Client state mutation reflected in server-side shared state within 100ms on a stable connection. |
| Reliability | Transport reconnects and resyncs without data loss for disconnections under 5 minutes. |
| Security | No LLM-sourced string reaches the DOM without passing through `sanitize()` — enforced by lint rule + test, not convention alone. |
| Security | Approval tokens are single-use, short-TTL, and unforgeable without the server-held session secret. |
| Scalability | State engine supports at least 50 concurrent collaborators per document in v1 (Yjs is proven well beyond this; this is a Flux-specific integration target, not a Yjs ceiling). |
| Accessibility | Renderer-provided default components meet WCAG 2.1 AA; custom components are the app author's responsibility. |
| Browser support | Last 2 versions of evergreen browsers (Chrome, Firefox, Safari, Edge); no IE11 support. |
| Observability | Every `FluxEnvelope` is loggable with a redaction hook for sensitive payloads. |

## 6. Data Models & Schemas

Covered inline above: `FluxEnvelope`, `FluxEventType`, the JSON Patch → Yjs mapping table, `ApprovalToken`. Component schemas are app-defined (Zod or equivalent) and registered at `FluxRenderer.register(componentName, schema, adapterComponent)`.

## 7. Security Requirements

**Threat model summary:**

| Threat | Mitigation |
|---|---|
| Prompt injection leads to malicious UI schema (e.g., a fake "Approve" button crafted to look native) | Approval UI is rendered from a trusted, framework-provided component that the LLM cannot author — LLM output can never define the approval affordance itself. |
| XSS via LLM-authored rich-text props | Mandatory `sanitize()` pass, enforced architecturally (§4.3) and by lint rule (RULES.md). |
| Replay of a captured approval token | Single-use nonce + short TTL (§4.4). |
| Supply-chain risk from third-party deps (Yjs, DOMPurify, etc.) | Dependency audit cadence defined in RULES.md §6. |
| Runaway agent bypassing HITL entirely | Sensitive actions must be registered through the HITL-gated call path; RULES.md §1 makes direct/ungated sensitive calls an architectural violation, and CI includes a static check for common bypass patterns. |

Full audit checklist expands in Phase 3 (see PHASES.md).

## 8. Testing Requirements

- **Unit:** every public function in `@flux/core`; property-based tests for the partial JSON parser (fuzzed truncation points) and the PatchBridge (fuzzed concurrent op sequences, asserting convergence).
- **Integration:** transport reconnect/resync scenarios; end-to-end patch → Yjs → rebroadcast round trip.
- **E2E (Playwright):** generative UI render from a simulated token stream; full HITL approve/deny/timeout flows.
- **Conformance suite:** identical behavioral test suite run against Vue, Svelte, and Solid adapters — a feature is not complete until it passes for every adapter claiming support.
- **Security:** adversarial payloads (script injection, deeply nested/oversized JSON, malformed patch ops, expired/reused tokens) run as a standing CI gate, not a one-time audit.

## 9. Dependencies & Third-Party Libraries

Yjs (CRDT engine), DOMPurify (sanitization), a JSON Patch utility library (or hand-rolled per §4.2's constraints — evaluate in Phase 0), Vite/Rollup (bundler plugin targets), Vitest, Playwright.

## 10. Open Technical Questions / Spikes Required

These should be resolved in Phase 0 (see PHASES.md) before their dependent phase begins:

1. Confirm the JSON Patch → Yjs translation (§4.2) holds up under real concurrent-edit fuzzing, not just the happy path.
2. Confirm Yjs bundle size is acceptable for the "zero-config, fast time-to-hello-world" DX goal.
3. Decide whether the partial JSON parser is hand-rolled or built on an existing tolerant-JSON library, given the extra requirement of streaming partial-schema validation.
4. Finalize whether v1 ships the HMAC session-token approval scheme only, or pulls the WebCrypto asymmetric option into v1.
