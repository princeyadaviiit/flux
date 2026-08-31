# Flux

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Phase: 2 - State Sync](https://img.shields.io/badge/Phase-2%20State%20Sync-blue.svg)]()

**Framework-agnostic library for building Agentic AI-Native web applications.**

Flux solves three core problems when building LLM-powered interactive web apps:
1. **Streaming UI** — Progressive rendering of LLM-generated UI as tokens arrive
2. **Three-way state sync** — CRDT-based convergence between client, server, and agent
3. **Safe autonomy** — Human-in-the-loop approval gates for sensitive actions

## Project Status

**Current Phase:** Phase 1 - Transport & Connectivity (Complete)  
**Status:** Production-Ready Transport Layer

### Completed
- ✅ Phase 0: All validation spikes successful
  - PatchBridge (JSON Patch ↔ Yjs) validated
  - HMAC approval tokens validated
  - Yjs bundle size acceptable
  - Custom parser approach decided
- ✅ Phase 1: Complete bidirectional transport layer
  - FluxEnvelope protocol with 10 event types
  - SSE Client/Server with auto-reconnect
  - WebSocket Client/Server with message queuing
  - FluxTransport unified API
  - Multiplexed event handling (no head-of-line blocking)
  - Comprehensive test suite and examples

### Next
- 🔜 Phase 2 (Weeks 5-8): State synchronization with Yjs CRDT

## Architecture

```
@flux/core         Framework-agnostic TypeScript core
@flux/vue          Vue 3 adapter (planned)
@flux/svelte       Svelte adapter (planned)
@flux/solid        SolidJS adapter (planned)
@flux/cli          Scaffolding tool (planned)
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
- **Phase 1 (Weeks 1-4):** Transport layer ← *We are here*
- **Phase 2 (Weeks 5-8):** State synchronization
- **Phase 3 (Weeks 9-12):** Generative renderer + adapters
- **Phase 4 (Weeks 13-16):** CLI, docs, launch
- **Phase 5 (Post-v1):** Hardening, ecosystem growth

---

**Built with ❤️ by the Flux Team**
