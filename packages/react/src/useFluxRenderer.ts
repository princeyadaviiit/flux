import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FluxRenderer,
  StreamingUIParser,
  RenderDescriptor,
  ComponentRegistration,
} from '@flux/core';

export interface UseFluxRendererReturn {
  descriptor: RenderDescriptor | null;
  isComplete: boolean;
  error: string | null;
  register: (name: string, registration: ComponentRegistration) => void;
  addChunk: (chunk: string) => void;
  complete: () => void;
  reset: () => void;
  parser: StreamingUIParser;
  renderer: FluxRenderer;
}

function hasReactDispatcher(): boolean {
  try {
    const internals = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    const dispatcher = internals?.ReactCurrentDispatcher?.current;
    return Boolean(dispatcher && typeof dispatcher.useState === 'function');
  } catch {
    return false;
  }
}

export function useFluxRenderer(initialRenderer?: FluxRenderer): UseFluxRendererReturn {
  if (hasReactDispatcher()) {
    return useFluxRendererHook(initialRenderer);
  } else {
    return createFluxRendererStandalone(initialRenderer);
  }
}

function useFluxRendererHook(initialRenderer?: FluxRenderer): UseFluxRendererReturn {
  const [descriptor, setDescriptor] = useState<RenderDescriptor | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rendererRef = useRef<FluxRenderer | null>(null);
  const parserRef = useRef<StreamingUIParser | null>(null);

  if (!rendererRef.current) {
    rendererRef.current = initialRenderer || new FluxRenderer();
  }
  if (!parserRef.current) {
    parserRef.current = new StreamingUIParser();
  }

  const renderer = rendererRef.current;
  const parser = parserRef.current;

  useEffect(() => {
    const unsubRender = renderer.onRender((desc) => {
      setDescriptor(desc);
      setIsComplete(desc.isComplete);
      setError(desc.error || null);
    });

    const unsubParser = renderer.attachParser(parser);

    return () => {
      unsubRender();
      unsubParser();
    };
  }, [renderer, parser]);

  const register = useCallback(
    (name: string, registration: ComponentRegistration) => {
      renderer.register(name, registration);
    },
    [renderer]
  );

  const addChunk = useCallback(
    (chunk: string) => {
      parser.addChunk(chunk);
    },
    [parser]
  );

  const complete = useCallback(() => {
    parser.complete();
  }, [parser]);

  const reset = useCallback(() => {
    parser.reset();
    setDescriptor(null);
    setIsComplete(false);
    setError(null);
  }, [parser]);

  return {
    descriptor,
    isComplete,
    error,
    register,
    addChunk,
    complete,
    reset,
    parser,
    renderer,
  };
}

function createFluxRendererStandalone(initialRenderer?: FluxRenderer): UseFluxRendererReturn {
  const renderer = initialRenderer || new FluxRenderer();
  const parser = new StreamingUIParser();
  let descriptor: RenderDescriptor | null = null;
  let isComplete = false;
  let error: string | null = null;

  renderer.onRender((desc) => {
    descriptor = desc;
    isComplete = desc.isComplete;
    error = desc.error || null;
  });

  renderer.attachParser(parser);

  return {
    get descriptor() {
      return descriptor;
    },
    get isComplete() {
      return isComplete;
    },
    get error() {
      return error;
    },
    register: (name: string, registration: ComponentRegistration) => {
      renderer.register(name, registration);
    },
    addChunk: (chunk: string) => {
      parser.addChunk(chunk);
    },
    complete: () => {
      parser.complete();
    },
    reset: () => {
      parser.reset();
      descriptor = null;
      isComplete = false;
      error = null;
    },
    parser,
    renderer,
  };
}
