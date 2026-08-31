/**
 * @flux/solid - createFluxAgent
 * SolidJS primitive for connecting to Flux agent and streaming state
 */

import { createSignal, onMount, onCleanup, Accessor } from 'solid-js';
import { FluxTransport, FluxTransportOptions, FluxEnvelope, ApprovalToken, TransportState } from '@flux/core';

export interface CreateFluxAgentOptions extends FluxTransportOptions {
  autoConnect?: boolean;
}

export interface CreateFluxAgentReturn {
  isConnected: Accessor<boolean>;
  isConnecting: Accessor<boolean>;
  streamingText: Accessor<string>;
  pendingApproval: Accessor<ApprovalToken | null>;
  connect: () => void;
  disconnect: () => void;
  send: (envelope: FluxEnvelope) => void;
  approve: (token: ApprovalToken) => void;
  reject: (actionId: string, reason?: string) => void;
  transport: FluxTransport;
}

export function createFluxAgent(options: CreateFluxAgentOptions): CreateFluxAgentReturn {
  const [isConnected, setIsConnected] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [streamingText, setStreamingText] = createSignal('');
  const [pendingApproval, setPendingApproval] = createSignal<ApprovalToken | null>(null);

  const transport = new FluxTransport(options);

  transport.onStateChange((state: TransportState) => {
    setIsConnected(state.state === 'connected');
    setIsConnecting(state.state === 'connecting' || state.state === 'reconnecting');
  });

  transport.on('text.delta', (envelope: FluxEnvelope<{ delta: string }>) => {
    if (envelope.payload?.delta) {
      setStreamingText(prev => prev + envelope.payload.delta);
    }
  });

  transport.on('approval.request', (envelope: FluxEnvelope<any>) => {
    setPendingApproval(envelope.payload);
  });

  const connect = () => {
    transport.connect();
  };

  const disconnect = () => {
    transport.disconnect();
  };

  const send = (envelope: FluxEnvelope) => {
    transport.send(envelope);
  };

  const approve = (token: ApprovalToken) => {
    transport.send({
      id: `appr-${Date.now()}`,
      type: 'approval.token',
      seq: 1,
      ts: Date.now(),
      payload: token,
    });
    setPendingApproval(null);
  };

  const reject = (actionId: string, reason?: string) => {
    transport.send({
      id: `rej-${Date.now()}`,
      type: 'error',
      seq: 1,
      ts: Date.now(),
      payload: { actionId, reason: reason || 'Rejected by user' },
    });
    setPendingApproval(null);
  };

  onMount(() => {
    if (options.autoConnect !== false) {
      connect();
    }
  });

  onCleanup(() => {
    disconnect();
  });

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
