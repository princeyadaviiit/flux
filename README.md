# Flux

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release: v1.0 Production Ready](https://img.shields.io/badge/Release-v1.0%20Production%20Ready-green.svg)]()
[![Tests: 120/120 Passed](https://img.shields.io/badge/Tests-120%2F120%20Passing-brightgreen.svg)]()

**Framework-agnostic library for building Agentic AI-Native web applications.**

Flux solves the three hardest problems when building LLM-powered interactive web applications:
1. **Streaming UI** — Progressive rendering of LLM-generated UI as tokens arrive with bounded repair heuristics and mandatory XSS sanitization.
2. **Three-Way State Sync** — CRDT-based convergence between client, server, and autonomous agents using RFC 6902 JSON Patches over the wire.
3. **Safe Autonomy (HITL)** — Cryptographically enforced Human-In-The-Loop approval gates with HMAC-SHA256 signatures and instant nonce burning.

---

## ⚡ Quick Start (< 2 Minutes)

Scaffold a new Flux application with your framework of choice:

```bash
# Interactive scaffolding
npm create flux@latest

# Or specify project name and template directly
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
- **[PRD.md](./PRD.md)** — Product requirements & vision
- **[TRD.md](./TRD.md)** — Technical specifications & protocol design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System architecture
- **[RULES.md](./RULES.md)** — Architectural invariants & constraints
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Contributing guidelines & standards
- **[docs/PHASE-4-SUMMARY.md](./docs/PHASE-4-SUMMARY.md)** — v1.0 Launch & Phase 4 summary
- **[docs/MEMORY.md](./docs/MEMORY.md)** — Development progress tracker

---

## 🧪 Testing & Validation

```bash
# Run all 120 tests across the monorepo
npm test

# Run tests in watch mode
npx vitest
```

```
 Test Files  10 passed (10)
      Tests  120 passed (120)
   Duration  7.58s
```

---

## 🗺️ Roadmap & Phase Status

- ✅ **Phase 0:** Validation Spikes & Technical Decision Records
- ✅ **Phase 1:** Bidirectional Transport Layer (`FluxTransport`, SSE, WebSocket)
- ✅ **Phase 2:** State Synchronization Engine (`FluxStore` with Yjs CRDT + `PatchBridge`)
- ✅ **Phase 3:** Generative UI Renderer, Sanitizer, HITL & Framework Adapters (Vue, Svelte, Solid)
- ✅ **Phase 4:** CLI Scaffolding Tool (`create-flux-app`), Vite Plugin, Playground & v1.0 Launch
- 🔜 **Phase 5 (Post-v1):** React Adapter (`@flux/react`), WebCrypto Asymmetric Keys, Multi-Region Relays

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

**Built with ❤️ by the Flux Team**
