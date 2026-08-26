# Flux — Engineering Rules & Guardrails

**Project:** Flux
**Status:** Ideation / Pre-Alpha
**Document version:** 0.1 (Draft)
**Last updated:** August 24, 2026
**Related documents:** PRD.md · TRD.md · ARCHITECTURE.md · PHASES.md · IMPLEMENTATION.md · GUIDE.md

---

## 0. How to Use This Document

This file is the single source of truth for **non-negotiable** constraints on the Flux codebase. It's written to be read by human contributors and by an AI coding assistant working in this repo alike — Section 8 is addressed specifically to the latter. When in doubt, this document overrides personal style preference; it does not override PRD.md or TRD.md, which it exists to help enforce.

## 1. Architectural Invariants (MUST / MUST NOT)

These are load-bearing. A PR that violates one of these should not merge on the strength of "it works," because the failure mode is usually a security or correctness issue that only shows up under concurrency or adversarial input.

1. **MUST** route all state mutations through `PatchBridge`. No package may write directly to a `Y.Doc` outside `@flux/core/state`.
2. **MUST** pass every LLM-authored string destined for an HTML-producing prop (`innerHTML`, `v-html`, `dangerouslySetInnerHTML`-equivalents, `srcdoc`, etc.) through the shared `sanitize()` utility. No adapter may introduce an alternate path.
3. **MUST NOT** execute a sensitive/side-effecting tool call unless it is either (a) explicitly allow-listed as safe at registration time, or (b) gated behind `agent.pauseForApproval()` with a verified token.
4. **MUST** invalidate an approval token's nonce immediately upon verification attempt — success or failure — to prevent replay.
5. **MUST** keep `@flux/core` framework-agnostic: nothing under `core/` may import Vue, Svelte, Solid, or React.
6. **MUST** implement and pass `@flux/conformance-tests` for any adapter claiming support for a feature. "Works in Vue" is not "done" until it also passes for Svelte and Solid, or is explicitly scoped otherwise.
7. **MUST NOT** assume cross-event-type ordering on the transport; use `seq` and `id`, not arrival order, for anything ordering-sensitive.
8. **MUST** update TRD.md's protocol table in the same PR that introduces a new `FluxEventType`.

## 2. Code Style & Conventions

- TypeScript strict mode everywhere; `any` requires an inline comment justifying why a stronger type isn't feasible.
- Prefer discriminated unions (as in `FluxEnvelope`/`FluxEventType`) over boolean flags for representing state.
- File layout inside each package mirrors its subsystem name (`transport/`, `state/`, `renderer/`, `hitl/`) — see IMPLEMENTATION.md §4 for the canonical tree.
- Public API surface is exported only from each package's `index.ts`; internal modules are not imported directly across package boundaries.

## 3. Package Boundaries

```
@flux/core           no dependency on any adapter or the CLI
@flux/vue             → depends on @flux/core only
@flux/svelte           → depends on @flux/core only
@flux/solid              → depends on @flux/core only
@flux/cli                  → depends on @flux/core for template content; references adapters only as peer dependencies in generated templates, never as a direct dependency of the CLI package itself
```

A dependency-graph lint check (e.g., via `dependency-cruiser` or Turborepo's own graph tooling) should enforce this in CI, not just in review.

## 4. Git Workflow & Commit Conventions

- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`) — this also drives changelog generation via Changesets.
- Branch naming: `phase-<n>/<short-description>` during the initial build (e.g., `phase-2/patch-bridge`), tracking PHASES.md.
- Every PR touching an architectural invariant (Section 1) requires a second reviewer, no exceptions, even pre-1.0.

## 5. Testing Rules

- No PR merges to `main` without the affected package's unit tests passing and, for `@flux/core` state/renderer changes, the relevant fuzz/property test passing.
- Adapter PRs must pass the shared conformance suite for that adapter.
- E2E (Playwright) suite runs on every PR into `main`; a red E2E suite blocks merge.
- Security-relevant changes (sanitization, approval tokens, transport auth) require an accompanying adversarial test case in the same PR — see TRD §8.

## 6. Security Rules

- Dependency audit (`npm audit` or equivalent) runs on every PR and on a weekly schedule against `main`.
- No secret (session HMAC keys, etc.) is ever logged, including in debug/verbose transport logging — the envelope logging hook (TRD §5) must support field-level redaction.
- New third-party dependencies require a one-line justification in the PR description (what it's for, why an existing dependency can't cover it).
- CSP baseline: no `unsafe-eval`; the renderer must not use `eval`/`Function` constructors to interpret LLM output under any circumstance.

## 7. Documentation Rules

- Every public function/class in `@flux/core` carries a TSDoc comment.
- Every new package ships with its own `README.md` covering its role and its position in ARCHITECTURE.md's component list.
- A change to any documented protocol (envelope shape, patch-op mapping, token claims) requires the corresponding TRD.md section to be updated in the same PR — docs and code drift is treated as a bug.

## 8. Rules for AI-Assisted Development

Addressed directly to any AI coding assistant (or human) picking up a task in this repo:

- Before modifying anything under `packages/core/src/state`, read ARCHITECTURE.md §4.2 and RULES.md §1 (rules 1 and 4) first — this is the most invariant-sensitive part of the codebase.
- Before modifying the sanitization path in `packages/core/src/renderer`, read RULES.md §1 (rule 2) — do not introduce a "temporary" unsanitized code path even behind a flag.
- Before adding a new `FluxEventType`, read TRD.md §4.1 and update its protocol table in the same change.
- When unsure which package should own a new piece of logic, check Section 3's boundary table before creating a new package or reaching across an existing boundary.
- Treat a failing conformance-suite run as a blocking failure, not a follow-up task — an adapter change that breaks conformance is not complete.
- Do not weaken an architectural invariant in Section 1 to make a test pass; if a test and an invariant conflict, that's a design conversation, not a quick fix.
