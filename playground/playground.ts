import {
  StreamingUIParser,
  FluxRenderer,
  FluxStore,
  ApprovalTokenManager,
  sanitize,
} from '../packages/core/src/index';

// Initialize Core Subsystems
const store = new FluxStore({
  session: { id: 'sess-playground-1' },
  metrics: { visits: 10420, conversion: 0.042 },
  status: 'ready',
});

const tokenManager = new ApprovalTokenManager({
  secret: 'playground-dev-secret-key-32chars',
  defaultTtlMs: 120000,
});

const parser = new StreamingUIParser();
const mountEl = document.getElementById('ui-mount')!;
const renderer = new FluxRenderer({
  mountElement: mountEl,
});

// Register Generative Components
renderer.register('MetricCard', {
  richTextProps: ['title', 'subtitle'],
  render: (props) => {
    const card = document.createElement('div');
    card.style.background = '#1e293b';
    card.style.border = '1px solid #334155';
    card.style.borderRadius = '12px';
    card.style.padding = '1.5rem';
    card.style.minWidth = '280px';
    card.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3)';

    card.innerHTML = `
      <div style="font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.5rem;">${sanitize(props.title || 'Loading metric...')}</div>
      <div style="font-size: 2rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">${props.value || '...'}</div>
      <div style="font-size: 0.875rem; color: #34d399; font-weight: 500;">${props.trend || ''}</div>
    `;
    return card;
  },
});

renderer.register('ActionCard', {
  richTextProps: ['description'],
  render: (props) => {
    const card = document.createElement('div');
    card.style.background = '#1e293b';
    card.style.border = '1px solid #eab308';
    card.style.borderRadius = '12px';
    card.style.padding = '1.5rem';
    card.style.minWidth = '320px';

    card.innerHTML = `
      <div style="color: #facc15; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.5rem;">⚠️ ${props.title || 'Sensitive Operation'}</div>
      <p style="color: #cbd5e1; font-size: 0.9rem; margin-bottom: 1rem;">${sanitize(props.description || 'Action awaiting authorization...')}</p>
      <div style="color: #94a3b8; font-size: 0.8rem;">Target: <code>${props.target || 'N/A'}</code></div>
    `;
    return card;
  },
});

renderer.register('DataTable', {
  render: (props) => {
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.overflowX = 'auto';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.color = '#e2e8f0';

    const headers = (props.headers || [])
      .map((h: string) => `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #475569; color: #94a3b8;">${sanitize(h)}</th>`)
      .join('');

    const rows = (props.rows || [])
      .map((row: any[]) => `
        <tr>${row.map(cell => `<td style="padding: 8px; border-bottom: 1px solid #334155;">${sanitize(String(cell))}</td>`).join('')}</tr>
      `)
      .join('');

    table.innerHTML = `<thead><tr>${headers}</tr></thead><tbody>${rows}</tbody>`;
    wrapper.appendChild(table);
    return wrapper;
  },
});

renderer.attachParser(parser);

// Sample Generative Payloads
const SAMPLES: Record<string, string> = {
  metric: JSON.stringify({
    component: 'MetricCard',
    title: 'Total AI Model Inferences',
    value: '4,892,100',
    trend: '+24.8% vs last month',
  }, null, 2),

  action_card: JSON.stringify({
    component: 'ActionCard',
    title: 'Deploy Production Cloud Infrastructure',
    description: 'Agent requested provisioning of 4x NVIDIA H100 instances in region <em>us-east-1</em>.',
    target: 'aws:ec2:cluster-prod-9',
  }, null, 2),

  xss_test: JSON.stringify({
    component: 'MetricCard',
    title: '<img src=x onerror="alert(\'XSS Executed!\')">Revenue Security Probe',
    value: '$999,999',
    trend: '<a href="javascript:alert(\'pwned\')">Click exploit</a> (Neutralized)',
  }, null, 2),

  complex_table: JSON.stringify({
    component: 'DataTable',
    headers: ['Service', 'Status', 'Latency', 'Uptime'],
    rows: [
      ['Auth Gateway', 'Operational', '14ms', '99.99%'],
      ['CRDT Sync Relay', 'Operational', '8ms', '100%'],
      ['LLM Streaming Bridge', 'Operational', '42ms', '99.95%'],
    ],
  }, null, 2),
};

// UI Elements
const rawStreamViewer = document.getElementById('raw-stream-viewer')!;
const parsedJsonViewer = document.getElementById('parsed-json-viewer')!;
const crdtStateViewer = document.getElementById('crdt-state-viewer')!;
const auditLog = document.getElementById('audit-log')!;
const repairStatus = document.getElementById('repair-status')!;
const sampleSelect = document.getElementById('sample-select') as HTMLSelectElement;
const hitlZone = document.getElementById('hitl-approval-zone')!;
const hitlNonce = document.getElementById('hitl-nonce')!;
const hitlDesc = document.getElementById('hitl-description')!;

function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
  auditLog.appendChild(entry);
  auditLog.scrollTop = auditLog.scrollHeight;
}

// Observe CRDT Store
store.observe((snapshot) => {
  crdtStateViewer.innerText = JSON.stringify(snapshot, null, 2);
});
crdtStateViewer.innerText = JSON.stringify(store.getSnapshot(), null, 2);

// Stream Simulator
let streamInterval: any = null;

function simulateStream(delay: number) {
  if (streamInterval) clearInterval(streamInterval);

  parser.reset();
  rawStreamViewer.innerText = '';
  parsedJsonViewer.innerText = '{}';
  hitlZone.classList.add('hidden');

  repairStatus.className = 'status-indicator streaming';
  repairStatus.innerText = 'Streaming & Repairing';

  const selectedSample = SAMPLES[sampleSelect.value] || SAMPLES.metric;
  let index = 0;
  const chunkSize = delay > 20 ? 3 : 12;

  log(`Beginning stream simulation for [${sampleSelect.value}]...`, 'info');

  streamInterval = setInterval(() => {
    if (index < selectedSample.length) {
      const chunk = selectedSample.slice(index, index + chunkSize);
      index += chunkSize;

      const parseResult = parser.addChunk(chunk);
      rawStreamViewer.innerText = parser.getBuffer();
      parsedJsonViewer.innerText = JSON.stringify(parseResult.data || {}, null, 2);
    } else {
      clearInterval(streamInterval);
      streamInterval = null;

      const finalResult = parser.complete();
      repairStatus.className = 'status-indicator complete';
      repairStatus.innerText = 'Stream Completed';

      log(`Stream complete. Validated state in parser: ${finalResult.success}`, 'success');

      // If sample was action card, trigger HITL
      if (sampleSelect.value === 'action_card') {
        triggerHITLFlow();
      }
    }
  }, delay);
}

let activeToken: any = null;

function triggerHITLFlow() {
  const token = tokenManager.createToken({
    actionId: 'act-deploy-prod-01',
    description: 'Deploy Production Cloud Infrastructure',
    params: { cluster: 'us-east-1-h100' },
  });

  activeToken = token;
  hitlDesc.innerText = token.description;
  hitlNonce.innerText = token.nonce.slice(0, 16) + '...';
  hitlZone.classList.remove('hidden');

  log(`🔒 HITL Execution Paused. Generated HMAC token for [${token.actionId}].`, 'warning');
}

// Event Listeners
document.getElementById('btn-stream-realistic')!.addEventListener('click', () => {
  simulateStream(40);
});

document.getElementById('btn-stream-fast')!.addEventListener('click', () => {
  simulateStream(5);
});

document.getElementById('btn-reset')!.addEventListener('click', () => {
  if (streamInterval) clearInterval(streamInterval);
  parser.reset();
  rawStreamViewer.innerText = 'Waiting to stream...';
  parsedJsonViewer.innerText = '{}';
  mountEl.innerHTML = '<div class="empty-state"><p>No active generative component.</p><small>Click "Simulate LLM Stream" to stream UI tokens.</small></div>';
  hitlZone.classList.add('hidden');
  repairStatus.className = 'status-indicator idle';
  repairStatus.innerText = 'Idle';
  log('Playground reset to default state.', 'info');
});

document.getElementById('btn-approve')!.addEventListener('click', () => {
  if (!activeToken) return;

  const verified = tokenManager.verifyToken(activeToken);
  if (verified.valid) {
    log(`✓ Token authorized and NONCE burned immediately. Action executed!`, 'success');
    store.set('lastApprovedAction', {
      actionId: activeToken.actionId,
      timestamp: Date.now(),
    });
    hitlZone.classList.add('hidden');
    activeToken = null;
  } else {
    log(`✕ Approval verification failed: ${verified.error}`, 'error');
  }
});

document.getElementById('btn-reject')!.addEventListener('click', () => {
  if (!activeToken) return;
  log(`✕ Action [${activeToken.actionId}] was explicitly rejected by human operator.`, 'error');
  hitlZone.classList.add('hidden');
  activeToken = null;
});

log('Interactive playground ready.', 'success');
