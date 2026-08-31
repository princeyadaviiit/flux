/**
 * @flux/vue - useFluxAgent
 * Vue 3 composable for connecting to Flux agent and streaming state
 */

import { ref, shallowRef, onMounted, onUnmounted, getCurrentInstance, Ref } from 'vue';
import { FluxTransport, FluxTransportOptions, FluxEnvelope, ApprovalToken, TransportState } from '@flux/core';

export interface UseFluxAgentOptions extends FluxTransportOptions {
  autoConnect?: boolean;
}

export interface UseFluxAgentReturn {
  isConnected: Ref<boolean>;
  isConnecting: Ref<boolean>;
  messages: Ref<string[]>;
  streamingText: Ref<string>;
  pendingApproval: Ref<ApprovalToken | null>;
  connect: () => void;
  disconnect: () => void;
  send: (envelope: FluxEnvelope) => void;
  approve: (token: ApprovalToken) => void;
  reject: (actionId: string, reason?: string) => void;
  transport: FluxTransport;
}

export function useFluxAgent(options: UseFluxAgentOptions): UseFluxAgentReturn {
  const isConnected = ref(false);
  const isConnecting = ref(false);
  const messages = ref<string[]>([]);
  const streamingText = ref('');
  const pendingApproval = shallowRef<ApprovalToken | null>(null);

  const transport = new FluxTransport(options);

  transport.onStateChange((state: TransportState) => {
    isConnected.value = state.state === 'connected';
    isConnecting.value = state.state === 'connecting' || state.state === 'reconnecting';
  });

  transport.on('text.delta', (envelope: FluxEnvelope<{ delta: string }>) => {
    if (envelope.payload?.delta) {
      streamingText.value += envelope.payload.delta;
    }
  });

  transport.on('approval.request', (envelope: FluxEnvelope<any>) => {
    pendingApproval.value = envelope.payload;
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
    pendingApproval.value = null;
  };

  const reject = (actionId: string, reason?: string) => {
    transport.send({
      id: `rej-${Date.now()}`,
      type: 'error',
      seq: 1,
      ts: Date.now(),
      payload: { actionId, reason: reason || 'Rejected by user' },
    });
    pendingApproval.value = null;
  };

  if (getCurrentInstance()) {
    onMounted(() => {
      if (options.autoConnect !== false) {
        connect();
      }
    });

    onUnmounted(() => {
      disconnect();
    });
  }

  return {
    isConnected,
    isConnecting,
    messages,
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
