# Flux

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Phase: 3 - Generative UI & Adapters](https://img.shields.io/badge/Phase-3%20Generative%20UI%20%26%20Adapters-green.svg)]()

**Framework-agnostic library for building Agentic AI-Native web applications.**

Flux solves three core problems when building LLM-powered interactive web apps:
1. **Streaming UI** — Progressive rendering of LLM-generated UI as tokens arrive
2. **Three-way state sync** — CRDT-based convergence between client, server, and agent
3. **Safe autonomy** — Human-in-the-loop approval gates for sensitive actions

## Project Status

**Current Phase:** Phase 3 - Generative UI Renderer, HITL & Adapters (Complete)  
**Status:** Production-Ready Core Subsystems & Framework Adapters

### Completed
- ✅ **Phase 0:** All validation spikes successful (PatchBridge, HMAC tokens, bundle size, parser)
- ✅ **Phase 1:** Complete bidirectional transport layer (SSE + WebSocket unified API, multiplexing)
- ✅ **Phase 2:** State synchronization engine (`FluxStore` with Yjs CRDT + `PatchBridge` RFC 6902)
- ✅ **Phase 3:** Generative UI renderer (`StreamingUIParser`, `FluxRenderer`), mandatory `sanitize()`, `AgentHITL` approval subsystem, framework adapters (`@flux/vue`, `@flux/svelte`, `@flux/solid`), and shared `@flux/conformance-tests` suite (113/113 tests passing)

### Next
- 🔜 **Phase 4 (Weeks 13-16):** Developer experience, scaffolding CLI (`create-flux-app`), bundler plugins, interactive playground, and launch

## Architecture

```
packages/
├── core/                   # @flux/core (TypeScript Core Subsystems)
├── vue/                    # @flux/vue (Vue 3 Composables)
├── svelte/                 # @flux/svelte (Svelte Stores)
├── solid/                  # @flux/solid (SolidJS Primitives)
└── conformance-tests/      # @flux/conformance-tests (Shared behavioral test suite)
```

## Documentation

- **[PRD.md](./PRD.md)** - Product vision and requirements
- **[TRD.md](./TRD.md)** - Technical specifications
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture
- **[RULES.md](./RULES.md)** - Engineering constraints
- **[PHASES.md](./PHASES.md)** - 16-week roadmap
- **[IMPLEMENTATION.md](./IMPLEMENTATION.md)** - Beginner's guide
- **[docs/PHASE-0-SUMMARY.md](./docs/PHASE-0-SUMMARY.md)** - Phase 0 validation results
- **[docs/MEMORY.md](./docs/MEMORY.md)** - Development progress tracker

## Getting Started

### Development Setup

```bash
# Clone the repository
git clone https://github.com/princeyadaviit/flux.git
cd flux

# Install dependencies
pnpm install

# Build packages
pnpm build

# Run tests
pnpm test
```

### Phase 0 Experiments

Phase 0 validation prototypes are preserved in `experiments/`:

```bash
cd experiments
npm install

# Run validation spikes
npm run test:patch-bridge    # PatchBridge convergence tests
npm run test:token           # HMAC approval token tests
npm run test:bundle          # Yjs bundle size analysis
npm run test:parser          # Parser decision analysis
```

## Core Principles

1. **Format authoring over component routing** - LLM emits declarative UI schema, not just selects components
2. **Framework agnostic** - Vanilla TypeScript core with thin adapters
3. **Safe by construction** - Sanitization and approval gates are architectural, not optional
4. **Zero-config DX** - One CLI command to working app

## Technology Stack

- **Language:** TypeScript (strict mode)
- **Monorepo:** Turborepo
- **State Sync:** Yjs (CRDT) + JSON Patch (RFC 6902)
- **Sanitization:** DOMPurify
- **Testing:** Vitest (unit), Playwright (E2E)
- **Target Frameworks:** Vue, Svelte, SolidJS (React deferred to v2)

## Non-Goals (v1.0)

- React adapter (strategic positioning - see PRD §7)
- Multi-agent orchestration
- Hosted/managed backend service
- Mobile (React Native / native) targets

## Contributing

This project is in active development. Contributions are welcome once Phase 1 is complete.

Before contributing:
1. Read **[RULES.md](./RULES.md)** - Non-negotiable constraints
2. Review **[PHASES.md](./PHASES.md)** - Current roadmap
3. Check **[docs/MEMORY.md](./docs/MEMORY.md)** - Development progress

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Roadmap

- **Phase 0 (Complete):** Validation spikes
- **Phase 1 (Complete):** Bidirectional transport layer
- **Phase 2 (Complete):** State synchronization with Yjs CRDT
- **Phase 3 (Complete):** Generative UI renderer, HITL & framework adapters
- **Phase 4 (Weeks 13-16):** CLI, bundler plugins, docs, launch ← *We are here*
- **Phase 5 (Post-v1):** Hardening, ecosystem growth

---

**Built with ❤️ by the Flux Team**
