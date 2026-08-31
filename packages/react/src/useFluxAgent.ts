import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FluxTransport, FluxTransportOptions, FluxEnvelope, ApprovalToken, TransportState } from '@flux/core';

export interface UseFluxAgentOptions extends FluxTransportOptions {
  autoConnect?: boolean;
}

export interface UseFluxAgentReturn {
  isConnected: boolean;
  isConnecting: boolean;
  streamingText: string;
  pendingApproval: ApprovalToken | null;
  connect: () => void;
  disconnect: () => void;
  send: (envelope: FluxEnvelope) => void;
  approve: (token: ApprovalToken) => void;
  reject: (actionId: string, reason?: string) => void;
  transport: FluxTransport;
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

export function useFluxAgent(options: UseFluxAgentOptions): UseFluxAgentReturn {
  if (hasReactDispatcher()) {
    return useFluxAgentHook(options);
  } else {
    return createFluxAgentStandalone(options);
  }
}

function useFluxAgentHook(options: UseFluxAgentOptions): UseFluxAgentReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingApproval, setPendingApproval] = useState<ApprovalToken | null>(null);

  const transportRef = useRef<FluxTransport | null>(null);
  if (!transportRef.current) {
    transportRef.current = new FluxTransport(options);
  }
  const transport = transportRef.current;

  useEffect(() => {
    const unsubState = transport.onStateChange((state: TransportState) => {
      setIsConnected(state.state === 'connected');
      setIsConnecting(state.state === 'connecting' || state.state === 'reconnecting');
    });

    const unsubDelta = transport.on('text.delta', (envelope: FluxEnvelope<{ delta: string }>) => {
      if (envelope.payload?.delta) {
        setStreamingText((prev) => prev + envelope.payload.delta);
      }
    });

    const unsubApproval = transport.on('approval.request', (envelope: FluxEnvelope<any>) => {
      setPendingApproval(envelope.payload);
    });

    if (options.autoConnect !== false) {
      transport.connect();
    }

    return () => {
      unsubState();
      unsubDelta();
      unsubApproval();
      transport.disconnect();
    };
  }, []);

  const connect = useCallback(() => {
    transport.connect();
  }, [transport]);

  const disconnect = useCallback(() => {
    transport.disconnect();
  }, [transport]);

  const send = useCallback((envelope: FluxEnvelope) => {
    transport.send(envelope);
  }, [transport]);

  const approve = useCallback((token: ApprovalToken) => {
    transport.send({
      id: `appr-${Date.now()}`,
      type: 'approval.token',
      seq: 1,
      ts: Date.now(),
      payload: token,
    });
    setPendingApproval(null);
  }, [transport]);

  const reject = useCallback((actionId: string, reason?: string) => {
    transport.send({
      id: `rej-${Date.now()}`,
      type: 'error',
      seq: 1,
      ts: Date.now(),
      payload: { actionId, reason: reason || 'Rejected by user' },
    });
    setPendingApproval(null);
  }, [transport]);

  return {
    isConnected,
    isConnecting,
    streamingText,
    pendingApproval,
    connect,
    disconnect,
    send,
    approve,
    reject,
    transport,
  };
}

function createFluxAgentStandalone(options: UseFluxAgentOptions): UseFluxAgentReturn {
  let isConnected = false;
  let isConnecting = false;
  let streamingText = '';
  let pendingApproval: ApprovalToken | null = null;

  const transport = new FluxTransport(options);

  transport.onStateChange((state: TransportState) => {
    isConnected = state.state === 'connected';
    isConnecting = state.state === 'connecting' || state.state === 'reconnecting';
  });

  transport.on('text.delta', (envelope: FluxEnvelope<{ delta: string }>) => {
    if (envelope.payload?.delta) {
      streamingText += envelope.payload.delta;
    }
  });

  transport.on('approval.request', (envelope: FluxEnvelope<any>) => {
    pendingApproval = envelope.payload;
  });

  if (options.autoConnect !== false) {
    transport.connect();
  }

  return {
    get isConnected() {
      return isConnected;
    },
    get isConnecting() {
      return isConnecting;
    },
    get streamingText() {
      return streamingText;
    },
    get pendingApproval() {
      return pendingApproval;
    },
    connect: () => transport.connect(),
    disconnect: () => transport.disconnect(),
    send: (env: FluxEnvelope) => transport.send(env),
    approve: (token: ApprovalToken) => {
      transport.send({
        id: `appr-${Date.now()}`,
        type: 'approval.token',
        seq: 1,
        ts: Date.now(),
        payload: token,
      });
      pendingApproval = null;
    },
    reject: (actionId: string, reason?: string) => {
      transport.send({
        id: `rej-${Date.now()}`,
        type: 'error',
        seq: 1,
        ts: Date.now(),
        payload: { actionId, reason: reason || 'Rejected by user' },
      });
      pendingApproval = null;
    },
    transport,
  };
}
