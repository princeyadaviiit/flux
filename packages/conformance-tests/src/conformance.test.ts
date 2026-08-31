/**
 * @flux/conformance-tests
 * Shared behavioral conformance test suite running across Core, Vue, Svelte, and Solid adapters.
 * Enforces RULES.md §1.6: "MUST implement and pass @flux/conformance-tests for any adapter claiming support"
 */

import { describe, it, expect } from 'vitest';
import { FluxRenderer, StreamingUIParser, ApprovalTokenManager, sanitize } from '@fluxmesh/core';
import { useFluxRenderer, useFluxAgent } from '@fluxmesh/vue';
import { createFluxRenderer as createSvelteRenderer, createFluxAgent as createSvelteAgent } from '@fluxmesh/svelte';
import { createFluxRenderer as createSolidRenderer, createFluxAgent as createSolidAgent } from '@fluxmesh/solid';
import { useFluxRenderer as useReactRenderer, useFluxAgent as useReactAgent } from '@fluxmesh/react';

describe('Shared Conformance Suite: Core Behavioral Guarantees', () => {
  it('CR-1: StreamingUIParser progressively repairs partial JSON without throwing', () => {
    const parser = new StreamingUIParser();
    const chunks = ['{"component": "Metric"', ', "value": 4', '2, "label": "Sales"'];

    let lastResult;
    for (const chunk of chunks) {
      lastResult = parser.addChunk(chunk);
      expect(lastResult.success).toBe(true);
    }

    const completeResult = parser.complete();
    expect(completeResult.complete).toBe(true);
    expect(completeResult.data).toEqual({
      component: 'Metric',
      value: 42,
      label: 'Sales',
    });
  });

  it('CR-2: Mandatory Sanitization neutralizes XSS in all contexts', () => {
    const maliciousPayload = '<p>Safe</p><script>alert("pwned")</script><img src=x onerror=alert(1)>';
    const clean = sanitize(maliciousPayload);

    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('alert');
    expect(clean).toContain('<p>Safe</p>');
  });

  it('CR-3: FluxRenderer degrades gracefully to fallback on unknown component', () => {
    const renderer = new FluxRenderer();
    const desc = renderer.handleParseResult({
      success: true,
      data: { component: 'UndefinedComponent123', someProp: 'data' },
      complete: true,
    });

    expect(desc?.isFallback).toBe(true);
    expect(desc?.componentName).toBe('FluxFallbackError');
  });

  it('CR-4: HITL approval tokens cannot be forged or replayed', async () => {
    const manager = new ApprovalTokenManager('conformance-secret-key');
    const token = manager.createToken('action-critical', 'session-100');

    // First check: valid
    const validCheck = await manager.verifyToken(token);
    expect(validCheck.valid).toBe(true);

    // Replay check: must fail
    const replayCheck = await manager.verifyToken(token);
    expect(replayCheck.valid).toBe(false);
    expect(replayCheck.reason).toContain('replay attack detected');
  });
});

describe('Shared Conformance Suite: Vue Adapter (@flux/vue)', () => {
  it('VR-1: useFluxRenderer correctly updates reactive state from token chunks', () => {
    const renderer = new FluxRenderer();
    renderer.register('AlertCard', { component: 'AlertCardTemplate' });

    const { currentRender, isStreaming, isComplete, addChunk, complete } = useFluxRenderer(renderer);

    addChunk('{"component": "AlertCard", "title": "Info"');
    expect(isStreaming.value).toBe(true);
    expect(currentRender.value?.componentName).toBe('AlertCard');
    expect(currentRender.value?.props.title).toBe('Info');

    complete();
    expect(isComplete.value).toBe(true);
    expect(isStreaming.value).toBe(false);
  });

  it('VR-2: useFluxAgent manages connection and approval reactivity', () => {
    const agent = useFluxAgent({
      sseUrl: 'http://localhost:3000/events',
      wsUrl: 'ws://localhost:3000/ws',
      autoConnect: false,
    });

    expect(agent.isConnected.value).toBe(false);
    expect(agent.streamingText.value).toBe('');
    expect(typeof agent.connect).toBe('function');
    expect(typeof agent.approve).toBe('function');
    expect(typeof agent.reject).toBe('function');
  });
});

describe('Shared Conformance Suite: Svelte Adapter (@flux/svelte)', () => {
  it('SR-1: createFluxRenderer store delivers progressive updates through subscriptions', () => {
    const renderer = new FluxRenderer();
    renderer.register('DataTable', { component: 'DataTableTemplate' });

    const store = createSvelteRenderer(renderer);

    let latestRender: any = null;
    let latestComplete = false;

    const unsubRender = store.currentRender.subscribe(val => {
      latestRender = val;
    });
    const unsubComplete = store.isComplete.subscribe(val => {
      latestComplete = val;
    });

    store.addChunk('{"component": "DataTable", "rows": 10');
    expect(latestRender?.componentName).toBe('DataTable');
    expect(latestRender?.props.rows).toBe(10);

    store.complete();
    expect(latestComplete).toBe(true);

    unsubRender();
    unsubComplete();
  });

  it('SR-2: createFluxAgent provides reactive readable stores', () => {
    const store = createSvelteAgent({
      sseUrl: 'http://localhost:3000/events',
      wsUrl: 'ws://localhost:3000/ws',
      reconnect: false,
    });

    let connected = true;
    const unsub = store.isConnected.subscribe(c => {
      connected = c;
    });

    expect(connected).toBe(false);
    expect(typeof store.connect).toBe('function');
    expect(typeof store.approve).toBe('function');
    unsub();
  });
});

describe('Shared Conformance Suite: SolidJS Adapter (@flux/solid)', () => {
  it('SLR-1: createFluxRenderer returns reactive signal accessors', () => {
    const renderer = new FluxRenderer();
    renderer.register('StatsView', { component: 'StatsViewTemplate' });

    const { currentRender, isComplete, addChunk, complete } = createSolidRenderer(renderer);

    addChunk('{"component": "StatsView", "uptime": "99.9%"');
    expect(currentRender()?.componentName).toBe('StatsView');
    expect(currentRender()?.props.uptime).toBe('99.9%');

    complete();
    expect(isComplete()).toBe(true);
  });

  it('SLR-2: createFluxAgent exposes reactive accessors and control methods', () => {
    const agent = createSolidAgent({
      sseUrl: 'http://localhost:3000/events',
      wsUrl: 'ws://localhost:3000/ws',
      autoConnect: false,
    });

    expect(agent.isConnected()).toBe(false);
    expect(agent.streamingText()).toBe('');
    expect(typeof agent.connect).toBe('function');
    expect(typeof agent.approve).toBe('function');
  });
});

describe('Shared Conformance Suite: React Adapter (@flux/react)', () => {
  it('RR-1: useFluxRenderer manages generative state and stream completion', () => {
    const renderer = new FluxRenderer();
    renderer.register('MetricCard', { component: 'MetricCardTemplate' });

    const { register, addChunk, complete, parser } = useReactRenderer(renderer);

    expect(typeof register).toBe('function');
    expect(typeof addChunk).toBe('function');
    expect(typeof complete).toBe('function');
    expect(parser).toBeDefined();

    addChunk('{"component": "MetricCard", "count": 42');
    expect(parser.getCurrentState()?.count).toBe(42);

    complete();
    expect(parser.getStatus()).toBe('complete');
  });

  it('RR-2: useFluxAgent provides agent connection, streaming, and approval dispatchers', () => {
    const agent = useReactAgent({
      sseUrl: 'http://localhost:3000/events',
      wsUrl: 'ws://localhost:3000/ws',
      autoConnect: false,
    });

    expect(agent.isConnected).toBe(false);
    expect(agent.streamingText).toBe('');
    expect(typeof agent.connect).toBe('function');
    expect(typeof agent.approve).toBe('function');
    expect(typeof agent.reject).toBe('function');
    expect(agent.transport).toBeDefined();
  });
});
