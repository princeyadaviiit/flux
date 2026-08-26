# Flux — Product Requirements Document (PRD)

**Project:** Flux
**Status:** Ideation / Pre-Alpha
**Document version:** 0.1 (Draft)
**Last updated:** August 24, 2026
**Related documents:** TRD.md · ARCHITECTURE.md · PHASES.md · RULES.md · IMPLEMENTATION.md · GUIDE.md

---

## 1. Vision

Flux is a framework-agnostic, open-source library for building **Agentic AI-Native** web applications — apps where an LLM agent is a first-class, real-time actor alongside the client UI and backend, not a bolted-on chatbot widget. Flux gives developers native primitives for bidirectional streaming, safe generative UI rendering, and human-in-the-loop control, with first-class support for Vue, Svelte, SolidJS, and Vanilla TypeScript.

## 2. Problem Statement

Building an LLM-powered interactive web app today means assembling fragmented tooling around three unresolved problems:

| Problem | Description |
|---|---|
| **Broken UI streaming** | LLMs emit UI configuration token-by-token; naive `JSON.parse()` throws on every incomplete chunk, forcing developers to hand-roll buffering and repair logic. |
| **Three-way state drift** | Client UI, backend database, and the agent's context window each hold their own view of "current state," and keeping them consistent in real time is largely unsolved outside of hand-written glue code. |
| **Unsafe autonomy** | Agents that can take real actions (write to a database, call a paid API, send an email) need a safe pause-and-approve mechanism, and most stacks don't provide one out of the box. |

Existing solutions (CopilotKit, Vercel AI SDK) address parts of this, but are React-first and treat the LLM primarily as a router selecting between pre-built components, rather than an author of UI structure.

## 3. Target Users & Personas

**Target audience:** Web developers, AI application builders, and startup founders.

### Persona A — "Priya," Indie AI App Builder
Building a solo SaaS product with an embedded AI agent. Wants to move fast, doesn't want to write her own streaming-JSON parser or state-sync layer. Not on React by preference — she uses SolidJS for performance.

### Persona B — "Marcus," Startup Founding Engineer
Second engineering hire at a seed-stage startup. Needs to ship an agent-driven internal tool that can execute real database actions, and is personally accountable if an agent does something destructive. Cares most about the HITL approval story.

### Persona C — "Elin," Framework-Loyal Web Developer
Vue/Svelte developer who has watched the AI tooling ecosystem build almost exclusively for React and feels underserved. Will adopt Flux specifically *because* it isn't React-only.

## 4. Goals

1. Provide a single library that solves streaming transport, state sync, generative UI rendering, and HITL approval as one coherent system rather than four separate integrations.
2. Ship first-class adapters for Vue, Svelte, and SolidJS (not React) at v1.0.
3. Get a new developer from `npm create` to a working generative UI in under 2 minutes.
4. Make unsafe agent autonomy structurally hard to ship by default (safe-by-default sanitization and approval gates).

## 5. Non-Goals (v1.0)

- React adapter (explicitly deferred — see Section 7).
- Multi-agent orchestration / agent-to-agent protocols.
- A hosted/managed backend service — Flux is a library, not a platform.
- Built-in LLM provider billing, key management, or model routing.
- Mobile (React Native / native) targets.

## 6. Core Philosophy & Differentiators

- **Format authoring over component routing.** Competitors treat the LLM as a router selecting between developer-defined React components. Flux lets the LLM emit a declarative UI *schema* that Flux safely renders — a broader and more flexible contract.
- **Framework agnostic.** A Vanilla TypeScript core with thin adapters, rather than a framework-specific core.
- **Zero-config DX.** One CLI command to a working app, strict-typed by default.
- **Safe by construction.** Sanitization and approval gates are part of the core contract, not an opt-in add-on.

## 7. Competitive Landscape

| | Flux | CopilotKit | Vercel AI SDK |
|---|---|---|---|
| Primary framework | Vue / Svelte / Solid / Vanilla TS | React | React (with some framework-agnostic core hooks) |
| LLM's role in UI | Authors a declarative schema | Selects/fills pre-built components | Streams text/objects; component wiring is manual |
| State sync model | CRDT-backed shared store | App-managed | App-managed |
| HITL as a primitive | Yes, first-class API | Partial (via generative UI + custom code) | Manual |

This is a genuine wedge, not a head-on competitive play: Flux is deliberately not competing for the React-first generative-UI market in v1.0, and is instead targeting an underserved ecosystem. That's a strategic bet that should be made explicitly (see Section 11).

## 8. Functional Requirements

Each requirement is tagged with priority: **P0** (blocking v1.0), **P1** (should have), **P2** (nice to have / can slip to v1.1).

### 8.1 Bidirectional Transport Layer (FR-1.x)

**FR-1.1 (P0):** As a developer, I can open a single `FluxTransport` connection that carries SSE (agent→client) and WebSocket (client→agent) traffic under one API, so I don't manage two connection lifecycles by hand.
*Acceptance criteria:* One `connect()` call establishes both channels; one `onEvent()` callback surface for all inbound event types; connection state is queryable (`connecting` / `open` / `reconnecting` / `closed`).

**FR-1.2 (P0):** As a developer, I can send text, JSON objects, and tool-call events over the same logical connection without one event type blocking another.
*Acceptance criteria:* A large text delta stream in progress does not delay delivery of a concurrent tool-call event; verified under load test with interleaved event types.

**FR-1.3 (P1):** As a developer, my app recovers from a dropped connection without losing in-flight state.
*Acceptance criteria:* SSE resumes via `Last-Event-ID`; WebSocket reconnects with exponential backoff; state resync uses a compact diff, not a full state retransmit.

### 8.2 Shared State Engine (FR-2.x)

**FR-2.1 (P0):** As a developer, when a user interacts with the UI, the resulting state change is expressed as a JSON Patch (RFC 6902) delta and applied to shared state without a full round-trip prompt to the LLM.
*Acceptance criteria:* A button click produces a patch op; the op is reflected in server-side shared state within the latency target in TRD §5; the agent's next turn sees the updated state without the app re-sending the entire object graph.

**FR-2.2 (P0):** As a developer, concurrent mutations from the client and the agent converge to the same final state on both sides without manual conflict resolution code.
*Acceptance criteria:* Two concurrent writes to different paths never lose data; two concurrent writes to the same path converge deterministically per CRDT semantics (see TRD §4.2 for the exact resolution rule).

**FR-2.3 (P1):** As a developer, the agent's context window receives state changes as compact deltas, not full-state re-sends, to control token cost.

### 8.3 Generative UI Renderer (FR-3.x)

**FR-3.1 (P0):** As a developer, I register a component with a schema, and Flux renders it progressively as the LLM streams its props, without throwing on incomplete JSON.
*Acceptance criteria:* A component with a required `title` string renders as soon as `title` is a complete, valid string, even if sibling props are still streaming.

**FR-3.2 (P0):** As a developer, any LLM-authored string that could contain markup is sanitized before it reaches the DOM, by default, with no opt-out required from me.
*Acceptance criteria:* A payload containing `<script>` or event-handler attributes never executes; verified via a security test suite (see TRD §7).

**FR-3.3 (P1):** As a developer, if the LLM emits a malformed or unknown component schema, my app degrades gracefully (e.g., a fallback/error component) instead of crashing.

### 8.4 Human-in-the-Loop Primitives (FR-4.x)

**FR-4.1 (P0):** As a developer, I can wrap any sensitive server-side action in `agent.pauseForApproval()` and the agent will not proceed until an approval token is verified.
*Acceptance criteria:* Execution provably halts (not just UI-hidden) until a valid token is received; unit test simulates a client that never responds and confirms the action never executes.

**FR-4.2 (P0):** As a developer, the approval token cannot be replayed or forged.
*Acceptance criteria:* Token is scoped to a specific action + session + short TTL; reused or expired tokens are rejected (see TRD §4.4 for the signing scheme).

**FR-4.3 (P1):** As a developer, I can customize the "Approval UI" shown to the end user rather than being stuck with a default.

## 9. Success Metrics (KPIs)

- **Adoption:** target GitHub stars / npm downloads within 3 months of public release (numeric target TBD by team — see Open Questions).
- **Time-to-Hello-World:** `npm create` → working generative UI in under 2 minutes.
- **Ecosystem penetration:** at least one high-profile community project adopts the Vue or Svelte adapter.
- **Safety:** zero critical security disclosures related to unsanitized LLM output or approval-token forgery in the first 6 months post-launch.

## 10. Assumptions

- Target developers are comfortable with TypeScript and modern build tooling.
- Yjs is an acceptable CRDT dependency (license, bundle size, maintenance status all acceptable — confirm in Phase 0 spike).
- Teams adopting Flux control both client and server (Flux is not designed for third-party/untrusted server integration in v1.0).

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Non-React positioning limits early adoption velocity | High | Treat as deliberate wedge strategy; set KPIs realistic to a smaller initial ecosystem; plan a React adapter as a fast-follow if traction proves the model. |
| JSON Patch ↔ CRDT reconciliation is harder than a "delta apply" bullet suggests | High | Dedicated Phase 0 spike before Phase 2 begins (see PHASES.md). |
| 16-week roadmap is optimistic for the full scope | Medium | Treat weeks 1–16 as Phase 1–4 (functional core); treat hardening, docs polish, and ecosystem growth as an explicit Phase 5 beyond week 16 (see PHASES.md). |
| Signed approval tokens are under-specified | Medium | TRD §4.4 defines a concrete v1 scheme (HMAC session tokens) with a documented upgrade path to asymmetric per-device keys. |

## 12. Open Questions

- What numeric adoption target should back the KPI in Section 9?
- Is a hosted playground / demo environment part of v1.0 or a fast-follow?
- Should Svelte or SolidJS be the second adapter after Vue, given team bandwidth is unlikely to build all three simultaneously?

## 13. Release Criteria for v1.0

- All P0 functional requirements in Section 8 pass acceptance criteria.
- Security audit (TRD §7) completed with no unresolved critical/high findings.
- Vue adapter at parity with core conformance test suite; at least one additional adapter (Svelte or Solid) at parity.
- `README.md`, `CONTRIBUTING.md`, and the CLI scaffolding tool are published.
