/**
 * @flux/svelte - createFluxRenderer
 * Svelte store for managing generative UI rendering lifecycle and descriptor state
 */

import { writable, Readable } from 'svelte/store';
import { FluxRenderer, StreamingUIParser, RenderDescriptor } from '@fluxmesh/core';

export interface FluxRendererStore {
  currentRender: Readable<RenderDescriptor | null>;
  isStreaming: Readable<boolean>;
  isComplete: Readable<boolean>;
  error: Readable<string | null>;
  addChunk: (chunk: string) => void;
  complete: () => void;
  reset: () => void;
  renderer: FluxRenderer;
  parser: StreamingUIParser;
}

export function createFluxRenderer(
  customRenderer?: FluxRenderer,
  customParser?: StreamingUIParser
): FluxRendererStore {
  const renderer = customRenderer || new FluxRenderer();
  const parser = customParser || new StreamingUIParser();

  const currentRender = writable<RenderDescriptor | null>(null);
  const isStreaming = writable(false);
  const isComplete = writable(false);
  const error = writable<string | null>(null);

  renderer.onRender(descriptor => {
    currentRender.set(descriptor);
    isComplete.set(descriptor.isComplete);
    if (descriptor.error) {
      error.set(descriptor.error);
    }
  });

  renderer.attachParser(parser);

  const addChunk = (chunk: string) => {
    isStreaming.set(true);
    parser.addChunk(chunk);
  };

  const complete = () => {
    isStreaming.set(false);
    isComplete.set(true);
    parser.complete();
  };

  const reset = () => {
    isStreaming.set(false);
    isComplete.set(false);
    error.set(null);
    currentRender.set(null);
    parser.reset();
  };

  return {
    currentRender: { subscribe: currentRender.subscribe },
    isStreaming: { subscribe: isStreaming.subscribe },
    isComplete: { subscribe: isComplete.subscribe },
    error: { subscribe: error.subscribe },
    addChunk,
    complete,
    reset,
    renderer,
    parser,
  };
}
