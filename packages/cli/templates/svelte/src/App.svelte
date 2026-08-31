<script lang="ts">
  import { createFluxAgent } from '@flux/svelte';

  const { isConnected, streamingText, pendingApproval, approve, reject } = createFluxAgent({
    sseUrl: 'http://localhost:5173/api/flux/events',
    autoConnect: true,
  });
</script>

<main style="font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 1.5rem; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h1>Flux + Svelte</h1>
  <p>Status: <strong>{$isConnected ? 'Connected 🟢' : 'Connecting... 🟡'}</strong></p>

  <section style="background: #f8fafc; padding: 1rem; border-radius: 6px; margin: 1rem 0;">
    <h3>Streaming Output:</h3>
    <pre style="white-space: pre-wrap; word-break: break-all;">{$streamingText || 'Waiting for agent tokens...'}</pre>
  </section>

  {#if $pendingApproval}
    <section style="background: #fef3c7; border: 1px solid #f59e0b; padding: 1rem; border-radius: 6px;">
      <h3>Approval Required</h3>
      <p>Action: {$pendingApproval.actionId}</p>
      <button on:click={() => approve($pendingApproval)} style="margin-right: 0.5rem; padding: 0.5rem 1rem; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Approve</button>
      <button on:click={() => reject($pendingApproval.actionId)} style="padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">Reject</button>
    </section>
  {/if}
</main>
