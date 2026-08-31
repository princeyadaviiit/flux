/**
 * @flux/solid - createFluxRenderer
 * SolidJS primitive for generative UI rendering with reactive signals
 */

import { createSignal, Accessor } from 'solid-js';
import { FluxRenderer, StreamingUIParser, RenderDescriptor } from '@fluxmesh/core';

export interface CreateFluxRendererReturn {
  currentRender: Accessor<RenderDescriptor | null>;
  isStreaming: Accessor<boolean>;
  isComplete: Accessor<boolean>;
  error: Accessor<string | null>;
  addChunk: (chunk: string) => void;
  complete: () => void;
  reset: () => void;
  renderer: FluxRenderer;
  parser: StreamingUIParser;
}

export function createFluxRenderer(
  customRenderer?: FluxRenderer,
  customParser?: StreamingUIParser
): CreateFluxRendererReturn {
  const renderer = customRenderer || new FluxRenderer();
  const parser = customParser || new StreamingUIParser();

  const [currentRender, setCurrentRender] = createSignal<RenderDescriptor | null>(null);
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [isComplete, setIsComplete] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  renderer.onRender(descriptor => {
    setCurrentRender(descriptor);
    setIsComplete(descriptor.isComplete);
    if (descriptor.error) {
      setError(descriptor.error);
    }
  });

  renderer.attachParser(parser);

  const addChunk = (chunk: string) => {
    setIsStreaming(true);
    parser.addChunk(chunk);
  };

  const complete = () => {
    setIsStreaming(false);
    setIsComplete(true);
    parser.complete();
  };

  const reset = () => {
    setIsStreaming(false);
    setIsComplete(false);
    setError(null);
    setCurrentRender(null);
    parser.reset();
  };

  return {
    currentRender,
    isStreaming,
    isComplete,
    error,
    addChunk,
    complete,
    reset,
    renderer,
    parser,
  };
}
