# FluxMesh

[![npm version](https://img.shields.io/npm/v/@fluxmesh/core.svg?color=blue)](https://www.npmjs.com/package/@fluxmesh/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release: v0.1.1 Production & Hardened](https://img.shields.io/badge/Release-v0.1.1%20Hardened-green.svg)]()
[![Tests: 130/130 Passed](https://img.shields.io/badge/Tests-130%2F130%20Passing-brightgreen.svg)]()

**The framework-agnostic TypeScript engine for building Agentic AI-Native web applications.**

FluxMesh bridges autonomous AI agents with modern web interfaces across **React, Vue, Svelte, Solid, and Vanilla TypeScript**.

---

## 📚 Complete Documentation & Guide

👉 **[Read the Full Documentation & Architecture Manual (docs/DOCUMENTATION.md)](./docs/DOCUMENTATION.md)**

Everything you need to build production-grade agentic applications:
- **[System Architecture & Data Flow](./docs/DOCUMENTATION.md#2-system-architecture--data-flow)**
- **[4 Core Pillars In-Depth](./docs/DOCUMENTATION.md#4-deep-dive-into-the-4-core-pillars)**:
  - 1. *Bidirectional Transport Layer* (SSE, WebSockets, Stream Diagnostics)
  - 2. *Three-Way State Sync* (Yjs CRDT, RFC 6902 JSON Patches)
  - 3. *Streaming Generative UI & Sanitization* (Partial JSON repair, DOMPurify XSS defense)
  - 4. *Safe Autonomy & HITL* (HMAC-SHA256 & ECDSA P-256 single-use nonces)
- **[Framework Quick Starts](./docs/DOCUMENTATION.md#5-framework-adapters--step-by-step-ui-integration)**:
  - [React (`@fluxmesh/react`)](./docs/DOCUMENTATION.md#react-fluxmeshreact)
  - [Vue 3 (`@fluxmesh/vue`)](./docs/DOCUMENTATION.md#vue-3-fluxmeshvue)
  - [Svelte (`@fluxmesh/svelte`)](./docs/DOCUMENTATION.md#svelte-fluxmeshsvelte)
  - [SolidJS (`@fluxmesh/solid`)](./docs/DOCUMENTATION.md#solidjs-fluxmeshsolid)
  - [Vanilla TypeScript (`@fluxmesh/core`)](./docs/DOCUMENTATION.md#vanilla-typescript-fluxmeshcore)
- **[Backend Integration Guide](./docs/DOCUMENTATION.md#6-backend-integration-guide)** (Express, FastAPI, Next.js)
- **[Real-World Enterprise Use Cases](./docs/DOCUMENTATION.md#7-real-world-enterprise-use-cases--case-studies)**
- **[Comprehensive API Reference](./docs/DOCUMENTATION.md#8-comprehensive-api-reference)**

---

## ⚡ Quick Start (< 2 Minutes)

Scaffold a new FluxMesh application with your framework of choice:

```bash
# Interactive scaffolding
npm create fluxmesh@latest

# Or specify project name and template directly
npm create fluxmesh@latest my-app --template react
npm create fluxmesh@latest my-app --template vue
npm create fluxmesh@latest my-app --template svelte
npm create fluxmesh@latest my-app --template solid
npm create fluxmesh@latest my-app --template vanilla

# Start development with built-in mock agent stream
cd my-app
npm install
npm run dev
```

---

## 📦 Monorepo Architecture

| Package | npm Package Name | Description |
|---|---|---|
| Core Subsystem | **`@fluxmesh/core`** | TypeScript core (`FluxTransport`, `FluxStore`, `FluxRenderer`, HITL) |
| React Adapter | **`@fluxmesh/react`** | React 18/19 hooks (`useFluxAgent`, `useFluxRenderer`) |
| Vue 3 Adapter | **`@fluxmesh/vue`** | Vue 3 composables (`useFluxAgent`, `useFluxRenderer`) |
| Svelte Adapter | **`@fluxmesh/svelte`** | Svelte stores (`createFluxAgent`, `createFluxRenderer`) |
| SolidJS Adapter | **`@fluxmesh/solid`** | SolidJS primitives (`createFluxAgent`, `createFluxRenderer`) |
| Scaffolding Tool | **`@fluxmesh/cli`** | CLI generator + Vite plugin (`fluxPlugin`) |
| Global Starter Bin | **`create-fluxmesh`** | Enables `npm create fluxmesh@latest` |
| Conformance Suite | **`@fluxmesh/conformance-tests`** | Cross-adapter behavioral test suite |

---

## 🎮 Interactive REPL Playground

Try the interactive browser-based playground to visualize token streaming repairs, component rendering, HMAC token approvals, and CRDT state synchronization:

```bash
npm run playground
```

---

## 🧪 Testing & Validation

```bash
# Run all 130 tests across the monorepo
npm test
```

```
 Test Files  12 passed (12)
      Tests  130 passed (130)
   Duration  8.28s
```

---

## 🛡️ Security Policy & Invariants

See **[SECURITY.md](./SECURITY.md)** for our formal vulnerability disclosure policy, cryptographic guarantees, and security invariants.

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

**Built with ❤️ by the FluxMesh Team**
