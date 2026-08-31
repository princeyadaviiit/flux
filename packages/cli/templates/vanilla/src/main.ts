import { FluxTransport, StreamingUIParser, FluxRenderer, sanitize, FluxEnvelope } from '@fluxmesh/core';

const statusEl = document.getElementById('status')!;
const outputEl = document.getElementById('output')!;
const mountEl = document.getElementById('renderer-mount')!;

const parser = new StreamingUIParser();
const renderer = new FluxRenderer();

renderer.register('MetricCard', {
  richTextProps: ['title'],
  component: (props: any) => {
    const card = document.createElement('div');
    card.style.padding = '1rem';
    card.style.border = '1px solid #3b82f6';
    card.style.borderRadius = '8px';
    card.style.background = '#eff6ff';
    card.innerHTML = `
      <h4 style="margin: 0 0 0.5rem 0; color: #1e40af;">${sanitize(props.title || 'Metric')}</h4>
      <div style="font-size: 1.5rem; font-weight: bold; color: #1e3a8a;">${props.value || '...'}</div>
      <div style="font-size: 0.875rem; color: #16a34a;">${props.trend || ''}</div>
    `;
    return card;
  },
});

renderer.onRender((descriptor) => {
  mountEl.innerHTML = '';
  if (typeof descriptor.component === 'function') {
    const domNode = descriptor.component(descriptor.props);
    if (domNode) mountEl.appendChild(domNode);
  }
});

renderer.attachParser(parser);

const transport = new FluxTransport({
  sseUrl: 'http://localhost:5173/api/flux/events',
  wsUrl: 'ws://localhost:5173/api/flux/ws',
});

transport.connect();

transport.onStateChange((state) => {
  if (state.state === 'connected') {
    statusEl.innerText = 'Status: Connected 🟢';
  } else {
    statusEl.innerText = 'Status: Connecting... 🟡';
  }
});

transport.on('text.delta', (envelope: FluxEnvelope<{ delta: string }>) => {
  if (envelope.payload?.delta) {
    parser.addChunk(envelope.payload.delta);
    outputEl.innerText = parser.getBuffer();
  }
});
