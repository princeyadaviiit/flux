import type { Plugin, ViteDevServer } from 'vite';
import { IncomingMessage, ServerResponse } from 'http';

export interface FluxPluginOptions {
  /** Enable simulated mock agent streaming during local dev (default: true) */
  enableMockAgent?: boolean;
  /** SSE endpoint path (default: '/api/flux/events') */
  ssePath?: string;
  /** WebSocket endpoint path (default: '/api/flux/ws') */
  wsPath?: string;
  /** Custom mock streaming chunks */
  mockChunks?: string[];
}

export function fluxPlugin(options: FluxPluginOptions = {}): Plugin {
  const {
    enableMockAgent = true,
    ssePath = '/api/flux/events',
    mockChunks = [
      '{"component": "MetricCard", "title": "Quarterly Revenue", "value": "$1,280,000", "trend": "+18.4%"}',
    ],
  } = options;

  return {
    name: 'vite-plugin-flux',
    configureServer(server: ViteDevServer) {
      if (!enableMockAgent) return;

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || '';

        if (url.startsWith(ssePath)) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });

          // Send initial connection event
          res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);

          // Simulate streaming JSON chunks
          let index = 0;
          const fullText = mockChunks[0] || '';
          const chunkSize = 8;

          const interval = setInterval(() => {
            if (index < fullText.length) {
              const slice = fullText.slice(index, index + chunkSize);
              index += chunkSize;
              res.write(
                `data: ${JSON.stringify({
                  id: `evt-${Date.now()}-${index}`,
                  type: 'ui.diff',
                  seq: index,
                  ts: Date.now(),
                  payload: { chunk: slice },
                })}\n\n`
              );
            } else {
              res.write(
                `data: ${JSON.stringify({
                  id: `evt-${Date.now()}-done`,
                  type: 'status',
                  seq: index + 1,
                  ts: Date.now(),
                  payload: { status: 'complete' },
                })}\n\n`
              );
              clearInterval(interval);
            }
          }, 60);

          req.on('close', () => {
            clearInterval(interval);
          });

          return;
        }

        next();
      });
    },
  };
}

export default fluxPlugin;
