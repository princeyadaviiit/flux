# Flux — Delivery Phases & Roadmap

**Project:** Flux
**Status:** Ideation / Pre-Alpha
**Document version:** 0.1 (Draft)
**Last updated:** August 24, 2026
**Related documents:** PRD.md · TRD.md · ARCHITECTURE.md · RULES.md · IMPLEMENTATION.md · GUIDE.md

---

## Timeline Assumptions

The original roadmap scopes a full v1 (transport → state sync → generative renderer → DX/launch) into 16 weeks. That's achievable as a **functional core** if — and only if — the two highest-uncertainty pieces are de-risked before the team commits to the schedule:

1. The JSON Patch ↔ Yjs reconciliation design (TRD §4.2).
2. The approval-token signing scheme (TRD §4.4).

This document therefore adds a **Phase 0** ahead of the original Phase 1, and an explicit **Phase 5** after the original Phase 4 for hardening and ecosystem work that realistically extends past week 16. Weeks 1–16 map exactly to the original four phases; nothing about that scope is being cut, only made more explicit about sequencing risk.

## Phase 0 — Spike & Validation (Week 0, before the clock starts)

**Goal:** Resolve the open technical questions in TRD §10 before committing engineering weeks to them.

**Tasks:**
- Prototype the JSON Patch → Yjs `PatchBridge` against a fuzzed concurrent-edit test (TRD §4.2 table) and confirm convergence holds.
- Prototype the HMAC approval-token scheme end-to-end (TRD §4.4) including replay-attempt rejection.
- Confirm Yjs bundle size against the "under 2 minutes to hello world" DX goal.
- Decide: hand-roll the partial JSON parser, or adapt an existing tolerant-JSON library.

**Exit criteria:** All four open questions in TRD §10 have a written decision. Without this, Phase 2 should not start on schedule.

## Phase 1 — Transport & Connectivity (Weeks 1–4)

**Goal:** Establish reliable, low-latency communication (PRD FR-1.x).

| Week | Focus |
|---|---|
| 1 | `FluxEnvelope` schema finalized; SSE client + server skeleton |
| 2 | WebSocket client + server skeleton; unified `FluxTransport` API surface |
| 3 | Multiplexing across event types; `Last-Event-ID` resume; WS reconnect/backoff |
| 4 | Load testing under interleaved event types; stream-stability test suite |

**Deliverables:** Custom transport layer (SSE/WS); multiplexing; initial test suite covering stream stability (as in the original brief), plus reconnect/resync behavior.

**Exit criteria:** FR-1.1, FR-1.2 acceptance criteria pass; FR-1.3 (reconnect) has at least a basic implementation, even if resync-via-state-vector isn't wired to the state engine yet (that lands in Phase 2).

**Top risk:** Multiplexing correctness under real network jitter is easy to get "mostly right" and hard to get fully right — budget explicit load-test time in week 4, don't treat it as a buffer week.

## Phase 2 — State Synchronization Engine (Weeks 5–8)

**Goal:** Solve the three-way state problem (PRD FR-2.x), building on the Phase 0 spike.

| Week | Focus |
|---|---|
| 5 | `FluxStore` wrapping `Y.Doc`; schema-to-Yjs mapping conventions |
| 6 | `PatchBridge` implementation per TRD §4.2's op-translation table |
| 7 | Server→agent compact-diff derivation; state-vector-based resync wired into `FluxTransport`'s reconnect path |
| 8 | Concurrency fuzz testing; integration tests verifying client/server sync under load |

**Deliverables:** CRDT-based shared state store; JSON Patch delta generation and application; integration tests verifying sync under load (as in the original brief).

**Exit criteria:** FR-2.1, FR-2.2 acceptance criteria pass, including the concurrent-edit convergence test from Phase 0.

**Top risk:** This phase inherits all the risk called out in PRD §11 — do not start week 5 until Phase 0's exit criteria are actually met, not just "mostly prototyped."

## Phase 3 — The Generative Renderer (Weeks 9–12)

**Goal:** Enable safe, dynamic UI rendering from partial streams (PRD FR-3.x).

| Week | Focus |
|---|---|
| 9 | Partial JSON parser + repair heuristics (TRD §4.3) |
| 10 | Partial/full schema validation; component registration API; prop-diff emission |
| 11 | Vue, Svelte, Solid adapters wired to the renderer; conformance suite scaffolded |
| 12 | Security audit on DOM injection; sanitization enforcement (lint rule + tests) |

**Deliverables:** Robust partial JSON parser; declarative rendering engine; adapters for Vue/Svelte/Solid; security audits on DOM injection (as in the original brief).

**Exit criteria:** FR-3.1–3.3 pass; conformance suite passes for all three adapters; sanitization is enforced architecturally, not just by convention (RULES.md §1.2).

## Phase 4 — DX, Packaging, and Launch (Weeks 13–16)

**Goal:** Ensure zero-friction adoption and community availability.

| Week | Focus |
|---|---|
| 13 | CLI scaffolding tool; project templates per framework |
| 14 | Vite/Rollup bundler plugin integration |
| 15 | `README.md`, `CONTRIBUTING.md`, technical documentation |
| 16 | Interactive REPL playground; launch readiness review |

**Deliverables:** CLI scaffolding tool; bundler plugin integration; complete `README.md`, `CONTRIBUTING.md`, and technical documentation; launch interactive REPL playground (as in the original brief).

**Exit criteria:** Time-to-hello-world under 2 minutes, measured on a fresh machine, not a warmed cache. PRD §13 release criteria met.

## Phase 5 — Hardening & Ecosystem Growth (Week 17+, post-v1)

Not in the original four-phase scope, added here because PRD §9's KPIs (GitHub stars, a "high-profile community project" adopting an adapter) are outcomes that take longer than a launch week to materialize, and because a genuine security posture (TRD §7) benefits from real-world usage, not just pre-launch review.

**Tasks:** ongoing security disclosure response process; HITL v2 (WebCrypto asymmetric tokens, TRD §4.4) if demand supports it; React adapter evaluation if traction validates expanding beyond the initial wedge (PRD §7); performance tuning based on real usage telemetry.

## Dependency Graph

```
Phase 0 ──▶ Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5
              │                        ▲
              └── transport must be stable before renderer work in Phase 3
                  can stream real events end-to-end
```

Phase 2 has a hard dependency on Phase 0's spike; Phase 3's adapters have a soft dependency on Phase 1's transport being stable enough to stream real (not mocked) events for realistic testing.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PatchBridge conflict semantics wrong under real concurrency | Medium | High | Phase 0 spike + fuzz testing before Phase 2 sign-off |
| 16-week scope slips | Medium | Medium | Treat Phase 5 as explicitly separate from "v1 launch"; don't let launch slip waiting for post-v1 polish |
| Adapter behavior diverges across Vue/Svelte/Solid | Medium | High | Shared conformance suite is a merge gate, not a nice-to-have (RULES.md §3) |
| Approval-token scheme has a security gap | Low | Critical | Dedicated security audit gate in Phase 3, adversarial test suite in TRD §8 |
