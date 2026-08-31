# Contributing to Flux

Thank you for your interest in contributing to **Flux**! Flux is an open-source, framework-agnostic library designed for building Agentic AI-Native web applications.

---

## 🏛️ Architectural Invariants (Non-Negotiable Rules)

Before submitting any code, ensure your changes adhere to the non-negotiable architectural rules defined in [`docs/RULES.md`](./docs/RULES.md):

1. **Framework Independence (RULES.md §1.5):** `@flux/core` must remain 100% vanilla TypeScript with zero framework dependencies (no React, Vue, Svelte, Solid, or DOM-specific libraries inside core).
2. **PatchBridge Wire Format (RULES.md §1.1):** All state updates over the network must use RFC 6902 JSON Patch format. Never expose raw Yjs binary updates directly to network consumers.
3. **Mandatory Sanitization (RULES.md §1.2):** All LLM-authored strings in rich-text UI props must pass through `sanitize()` before rendering to prevent XSS attacks.
4. **Immediate Nonce Invalidation (RULES.md §1.4):** Nonces for approval tokens must be invalidated immediately upon any verification attempt (whether successful or failed) to prevent replay and timing attacks.
5. **Adapter Parity (RULES.md §1.6):** Any framework adapter claiming support must pass all test cases in `@flux/conformance-tests`.

---

## 🛠️ Development Setup

Flux uses a modern monorepo structure powered by npm workspaces and Vitest.

### Prerequisites
- Node.js >= 18.0.0
- npm >= 8.0.0

### Getting Started

```bash
# Clone the repository
git clone https://github.com/princeyadaviiit/flux.git
cd flux

# Install dependencies
npm install

# Run the full test suite
npm test

# Launch the interactive playground
npm run playground
```

---

## 🧪 Testing Guidelines

Every bug fix, feature, or adapter must be accompanied by comprehensive tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npx vitest

# Run tests for a specific package
npm test -- packages/core
npm test -- packages/conformance-tests
```

### Test Coverage Requirements
- New transport protocols or clients must test reconnection, heartbeats, and error states.
- New state mutations must verify CRDT convergence under concurrent edits.
- Incremental parser changes must include fuzz testing against partial string cuts.
- New adapters must implement `@flux/conformance-tests`.

---

## 📂 Repository Structure

```
packages/
├── core/               # Framework-agnostic TypeScript core
├── vue/                # Vue 3 composables (@flux/vue)
├── svelte/             # Svelte stores (@flux/svelte)
├── solid/              # SolidJS primitives (@flux/solid)
├── cli/                # Scaffolding tool (@flux/cli)
└── conformance-tests/  # Shared cross-adapter conformance test suite
playground/             # Interactive browser REPL playground
docs/                   # Architecture, specifications, and guides
```

---

## 🚀 Pull Request Workflow

1. Fork the repo and create your feature branch: `git checkout -b feat/my-feature`
2. Ensure your code builds with no errors: `npm run build`
3. Verify all test suites pass: `npm test`
4. Commit your changes following conventional commits: `git commit -m "feat(core): add feature description"`
5. Push to your branch and open a Pull Request against `main`.

Thank you for helping build the future of Agentic AI web applications!
