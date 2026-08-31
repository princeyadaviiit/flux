/**
 * @flux/vue - useFluxRenderer
 * Vue 3 composable for generative UI rendering with reactive descriptor updates
 */

import { shallowRef, ref, Ref, ShallowRef } from 'vue';
import { FluxRenderer, StreamingUIParser, RenderDescriptor } from '@fluxmesh/core';

export interface UseFluxRendererReturn {
  currentRender: ShallowRef<RenderDescriptor | null>;
  isStreaming: Ref<boolean>;
  isComplete: Ref<boolean>;
  error: Ref<string | null>;
  addChunk: (chunk: string) => void;
  complete: () => void;
  reset: () => void;
  renderer: FluxRenderer;
  parser: StreamingUIParser;
}

export function useFluxRenderer(
  customRenderer?: FluxRenderer,
  customParser?: StreamingUIParser
): UseFluxRendererReturn {
  const renderer = customRenderer || new FluxRenderer();
  const parser = customParser || new StreamingUIParser();

  const currentRender = shallowRef<RenderDescriptor | null>(null);
  const isStreaming = ref(false);
  const isComplete = ref(false);
  const error = ref<string | null>(null);

  renderer.onRender(descriptor => {
    currentRender.value = descriptor;
    isComplete.value = descriptor.isComplete;
    if (descriptor.error) {
      error.value = descriptor.error;
    }
  });

  renderer.attachParser(parser);

  const addChunk = (chunk: string) => {
    isStreaming.value = true;
    parser.addChunk(chunk);
  };

  const complete = () => {
    isStreaming.value = false;
    isComplete.value = true;
    parser.complete();
  };

  const reset = () => {
    isStreaming.value = false;
    isComplete.value = false;
    error.value = null;
    currentRender.value = null;
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
