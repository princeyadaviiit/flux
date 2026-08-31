# Flux

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release: v1.1 Production & Hardened](https://img.shields.io/badge/Release-v1.1%20Hardened-green.svg)]()
[![Tests: 130/130 Passed](https://img.shields.io/badge/Tests-130%2F130%20Passing-brightgreen.svg)]()

**Framework-agnostic library for building Agentic AI-Native web applications.**

Flux solves the hardest challenges when building LLM-powered interactive web applications:
1. **Streaming UI** — Progressive rendering of LLM-generated UI as tokens arrive with bounded repair heuristics and mandatory XSS sanitization.
2. **Three-Way State Sync** — CRDT-based convergence between client, server, and autonomous agents using RFC 6902 JSON Patches over the wire.
3. **Safe Autonomy (HITL v1 & v2)** — Cryptographically enforced Human-In-The-Loop approval gates with HMAC-SHA256 and ECDSA (P-256) asymmetric key signatures with instant nonce burning.

---

## ⚡ Quick Start (< 2 Minutes)

Scaffold a new Flux application with your framework of choice:

```bash
# Interactive scaffolding
npm create flux@latest

# Or specify project name and template directly
npm create flux@latest my-app --template react
npm create flux@latest my-app --template vue
npm create flux@latest my-app --template svelte
npm create flux@latest my-app --template solid
npm create flux@latest my-app --template vanilla

# Start development with built-in mock agent stream
cd my-app
npm install
npm run dev
```

---

## 📦 Monorepo Architecture

```
packages/
├── core/               # @flux/core (TypeScript Core Subsystems)
├── react/              # @flux/react (React 18/19 Hooks)
├── vue/                # @flux/vue (Vue 3 Composables)
├── svelte/             # @flux/svelte (Svelte Stores)
├── solid/              # @flux/solid (SolidJS Primitives)
├── cli/                # @flux/cli (create-flux-app + Vite Plugin)
└── conformance-tests/  # @flux/conformance-tests (Cross-adapter behavioral suite)
playground/             # Interactive Browser REPL Playground
```

---

## 🎮 Interactive REPL Playground

Try the interactive browser-based playground to visualize token streaming repairs, component rendering, HMAC token approvals, and CRDT state synchronization:

```bash
npm run playground
```

---

## 📖 Documentation

- **[Developer Guide & API Reference](./docs/GUIDE.md)** — Complete end-to-end tutorial & recipes
- **[Security Policy & Invariants](./SECURITY.md)** — Cryptographic guarantees & vulnerability reporting
- **[PRD.md](./PRD.md)** — Product requirements & vision
- **[TRD.md](./TRD.md)** — Technical specifications & protocol design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System architecture
- **[RULES.md](./RULES.md)** — Architectural invariants & constraints
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Contributing guidelines & standards
- **[docs/PHASE-5-SUMMARY.md](./docs/PHASE-5-SUMMARY.md)** — Phase 5 Hardening & Ecosystem summary
- **[docs/MEMORY.md](./docs/MEMORY.md)** — Development progress tracker

---

## 🧪 Testing & Validation

```bash
# Run all 130 tests across the monorepo
npm test

# Run tests in watch mode
npx vitest
```

```
 Test Files  12 passed (12)
      Tests  130 passed (130)
   Duration  7.89s
```

---

## 🗺️ Roadmap & Complete Milestones

- ✅ **Phase 0:** Validation Spikes & Technical Decision Records
- ✅ **Phase 1:** Bidirectional Transport Layer (`FluxTransport`, SSE, WebSocket)
- ✅ **Phase 2:** State Synchronization Engine (`FluxStore` with Yjs CRDT + `PatchBridge`)
- ✅ **Phase 3:** Generative UI Renderer, Sanitizer, HITL & Framework Adapters (Vue, Svelte, Solid)
- ✅ **Phase 4:** CLI Scaffolding Tool (`create-flux-app`), Vite Plugin, Playground & v1.0 Launch
- ✅ **Phase 5:** Hardening, React Adapter (`@flux/react`), ECDSA Asymmetric Signing (HITL v2), Stream Diagnostics Telemetry & Security Policy (v1.1)

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

**Built with ❤️ by the Flux Team**
