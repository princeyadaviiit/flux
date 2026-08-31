# Flux Developer Guide & API Reference

Welcome to the comprehensive guide for **Flux**, the framework-agnostic foundation for building Agentic AI-Native web applications.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [The Four Core Pillars](#2-the-four-core-pillars)
   - [Pillar 1: Transport & Connectivity](#pillar-1-transport--connectivity)
   - [Pillar 2: Three-Way State Sync](#pillar-2-three-way-state-sync)
   - [Pillar 3: Streaming Generative UI](#pillar-3-streaming-generative-ui)
   - [Pillar 4: Safe Autonomy & HITL](#pillar-4-safe-autonomy--hitl)
3. [Framework Adapters](#3-framework-adapters)
   - [Vue 3 (`@flux/vue`)](#vue-3-fluxvue)
   - [Svelte (`@flux/svelte`)](#svelte-fluxsvelte)
   - [SolidJS (`@flux/solid`)](#solidjs-fluxsolid)
   - [Vanilla TypeScript (`@flux/core`)](#vanilla-typescript-fluxcore)
4. [Vite Bundler Plugin](#4-vite-bundler-plugin)
5. [Security Best Practices](#5-security-best-practices)

---

## 1. Quick Start

Create a new Flux application in under 2 minutes using `@flux/cli`:

```bash
# Scaffolding with interactive prompts
npm create flux@latest

# Or specify project name and framework template directly
npm create flux@latest my-agent-app --template vue
npm create flux@latest my-agent-app --template svelte
npm create flux@latest my-agent-app --template solid
npm create flux@latest my-agent-app --template vanilla

# Start development server with simulated mock agent
cd my-agent-app
npm install
npm run dev
```

---

## 2. The Four Core Pillars

### Pillar 1: Transport & Connectivity

Flux provides a unified bidirectional transport layer that multiplexes incoming SSE streams from agents and outgoing WebSocket messages from users without head-of-line blocking.

```typescript
import { FluxTransport } from '@flux/core';

const transport = new FluxTransport({
  sseUrl: 'https://api.example.com/flux/events',
  wsUrl: 'wss://api.example.com/flux/ws',
  autoConnect: true,
});

// Listen for connection state changes
transport.onStateChange((state) => {
  console.log('Connection state:', state.state); // 'connected' | 'connecting' | 'disconnected'
});

// Subscribe to streaming text deltas
transport.on('text.delta', (envelope) => {
  console.log('Token chunk:', envelope.payload.delta);
});

// Send client-authored events
transport.send({
  id: 'msg-001',
  type: 'message.create',
  seq: 1,
  ts: Date.now(),
  payload: { text: 'Hello, Agent!' },
});
```

---

### Pillar 2: Three-Way State Sync

`FluxStore` provides collaborative, conflict-free state synchronization powered by Yjs CRDTs on the client and server while using standard RFC 6902 JSON Patches over the wire.

```typescript
import { FluxStore, PatchBridge } from '@flux/core';

// Initialize reactive CRDT store
const store = new FluxStore({
  user: { name: 'Alice' },
  agentState: { status: 'idle', currentPlan: [] },
});

// Listen to state changes
const unsubscribe = store.observe((snapshot) => {
  console.log('Current state snapshot:', snapshot);
});

// Update state locally
store.set('agentState.status', 'executing');

// Apply incoming RFC 6902 JSON Patches from agent/server
const patch = [{ op: 'replace', path: '/agentState/status', value: 'completed' }];
PatchBridge.applyPatch(store.getYDoc(), patch);
```

---

### Pillar 3: Streaming Generative UI

`StreamingUIParser` incrementally repairs truncated, incomplete JSON tokens from streaming LLMs and pipes them to `FluxRenderer` for smooth progressive rendering.

```typescript
import { StreamingUIParser, FluxRenderer, sanitize } from '@flux/core';

const parser = new StreamingUIParser();
const renderer = new FluxRenderer({
  mountElement: document.getElementById('app')!,
});

// Register generative component with rich-text props
renderer.register('MetricCard', {
  richTextProps: ['title'],
  render: (props) => {
    const el = document.createElement('div');
    el.innerHTML = `<h3>${sanitize(props.title)}</h3><p>${props.value || '...'}</p>`;
    return el;
  },
});

renderer.attachParser(parser);

// Stream chunks from LLM
parser.addChunk('{"component": "MetricCard", "title": "Revenue"');
// UI mounts immediately and displays "Revenue"

parser.addChunk(', "value": "$1,200,000"}');
// UI progressively updates value without remounting

parser.complete();
```

---

### Pillar 4: Safe Autonomy & HITL

Gated execution guarantees that side-effecting operations (e.g. database mutations, payments, deployments) pause execution until signed human approval is received.

```typescript
import { AgentHITL, ApprovalTokenManager } from '@flux/core';

const tokenManager = new ApprovalTokenManager({
  secret: process.env.FLUX_SECRET_KEY!,
  defaultTtlMs: 120000,
});

const hitl = new AgentHITL(tokenManager);

// Inside server agent workflow:
async function executeSensitiveTask() {
  const approval = await hitl.pauseForApproval({
    actionId: 'act-deploy-01',
    description: 'Deploy release v1.4.0 to production',
    params: { env: 'production', version: '1.4.0' },
  });

  if (approval.approved) {
    console.log('Action authorized by user. Proceeding with deployment.');
    // execute deployment...
  } else {
    console.log('Action rejected:', approval.reason);
  }
}
```

---

## 3. Framework Adapters

### Vue 3 (`@flux/vue`)

```vue
<script setup lang="ts">
import { useFluxAgent } from '@flux/vue';

const { isConnected, streamingText, pendingApproval, approve, reject } = useFluxAgent({
  sseUrl: '/api/flux/events',
  autoConnect: true,
});
</script>

<template>
  <div>
    <p>Status: {{ isConnected ? 'Connected' : 'Connecting...' }}</p>
    <pre>{{ streamingText }}</pre>

    <div v-if="pendingApproval">
      <p>Approval: {{ pendingApproval.description }}</p>
      <button @click="approve(pendingApproval)">Approve</button>
      <button @click="reject(pendingApproval.actionId)">Reject</button>
    </div>
  </div>
</template>
```

### Svelte (`@flux/svelte`)

```svelte
<script lang="ts">
  import { createFluxAgent } from '@flux/svelte';

  const { isConnected, streamingText, pendingApproval, approve, reject } = createFluxAgent({
    sseUrl: '/api/flux/events',
    autoConnect: true,
  });
</script>

<p>Status: {$isConnected ? 'Connected' : 'Connecting...'}</p>
<pre>{$streamingText}</pre>

{#if $pendingApproval}
  <div>
    <p>Approval: {$pendingApproval.description}</p>
    <button on:click={() => approve($pendingApproval)}>Approve</button>
    <button on:click={() => reject($pendingApproval.actionId)}>Reject</button>
  </div>
{/if}
```

### SolidJS (`@flux/solid`)

```tsx
import { createFluxAgent } from '@flux/solid';
import { Show } from 'solid-js';

export function App() {
  const { isConnected, streamingText, pendingApproval, approve, reject } = createFluxAgent({
    sseUrl: '/api/flux/events',
    autoConnect: true,
  });

  return (
    <div>
      <p>Status: {isConnected() ? 'Connected' : 'Connecting...'}</p>
      <pre>{streamingText()}</pre>

      <Show when={pendingApproval()}>
        {(approval) => (
          <div>
            <p>Approval: {approval().description}</p>
            <button onClick={() => approve(approval())}>Approve</button>
            <button onClick={() => reject(approval().actionId)}>Reject</button>
          </div>
        )}
      </Show>
    </div>
  );
}
```

---

## 4. Vite Bundler Plugin

Use `@flux/cli`'s Vite plugin to mock LLM streams and agent endpoints during development:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fluxPlugin } from '@flux/cli';

export default defineConfig({
  plugins: [
    vue(),
    fluxPlugin({
      enableMockAgent: true,
      ssePath: '/api/flux/events',
    }),
  ],
});
```

---

## 5. Security Best Practices

1. **Never bypass `sanitize()`**: Always declare rich-text props in `richTextProps` when registering generative UI components.
2. **Session Secret Rotation**: Ensure `ApprovalTokenManager` uses a cryptographically random secret with at least 256 bits of entropy.
3. **Strict Nonce Checking**: Approval tokens are strictly single-use. Every verification attempt automatically consumes the nonce.
