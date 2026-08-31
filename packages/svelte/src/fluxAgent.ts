/**
 * @flux/svelte - createFluxAgent
 * Svelte store for managing Flux connection, streaming text, and approval tokens
 */

import { writable, Readable } from 'svelte/store';
import { FluxTransport, FluxTransportOptions, FluxEnvelope, ApprovalToken } from '@flux/core';

export interface FluxAgentStore {
  isConnected: Readable<boolean>;
  isConnecting: Readable<boolean>;
  streamingText: Readable<string>;
  pendingApproval: Readable<ApprovalToken | null>;
  connect: () => void;
  disconnect: () => void;
  send: (envelope: FluxEnvelope) => void;
  approve: (token: ApprovalToken) => void;
  reject: (actionId: string, reason?: string) => void;
  transport: FluxTransport;
}

export function createFluxAgent(options: FluxTransportOptions): FluxAgentStore {
  const isConnected = writable(false);
  const isConnecting = writable(false);
  const streamingText = writable('');
  const pendingApproval = writable<ApprovalToken | null>(null);

  const transport = new FluxTransport(options);

  transport.onStateChange(state => {
    isConnected.set(state.state === 'connected');
    isConnecting.set(state.state === 'connecting' || state.state === 'reconnecting');
  });

  transport.on('text.delta', (envelope: FluxEnvelope<{ delta: string }>) => {
    if (envelope.payload?.delta) {
      streamingText.update(text => text + envelope.payload.delta);
    }
  });

  transport.on('approval.request', (envelope: FluxEnvelope<any>) => {
    pendingApproval.set(envelope.payload);
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
    pendingApproval.set(null);
  };

  const reject = (actionId: string, reason?: string) => {
    transport.send({
      id: `rej-${Date.now()}`,
      type: 'error',
      seq: 1,
      ts: Date.now(),
      payload: { actionId, reason: reason || 'Rejected by user' },
    });
    pendingApproval.set(null);
  };

  return {
    isConnected: { subscribe: isConnected.subscribe },
    isConnecting: { subscribe: isConnecting.subscribe },
    streamingText: { subscribe: streamingText.subscribe },
    pendingApproval: { subscribe: pendingApproval.subscribe },
    connect,
    disconnect,
    send,
    approve,
    reject,
    transport,
  };
}
