import React from 'react';
import { useFluxAgent } from '@fluxmesh/react';

export default function App() {
  const { isConnected, streamingText, pendingApproval, approve, reject } = useFluxAgent({
    sseUrl: 'http://localhost:5173/api/flux/events',
    autoConnect: true,
  });

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '720px', margin: '2rem auto', padding: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      <h1>Flux + React</h1>
      <p>Status: <strong>{isConnected ? 'Connected 🟢' : 'Connecting... 🟡'}</strong></p>

      <section style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', margin: '1rem 0' }}>
        <h3>Streaming Output:</h3>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{streamingText || 'Waiting for agent tokens...'}</pre>
      </section>

      {pendingApproval && (
        <section style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: '1rem', borderRadius: '6px' }}>
          <h3>Approval Required</h3>
          <p>Action: {pendingApproval.actionId}</p>
          <button onClick={() => approve(pendingApproval)} style={{ marginRight: '0.5rem', padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Approve</button>
          <button onClick={() => reject(pendingApproval.actionId)} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Reject</button>
        </section>
      )}
    </main>
  );
}
