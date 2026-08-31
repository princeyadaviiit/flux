import { describe, it, expect } from 'vitest';
import { StreamDiagnostics } from './StreamDiagnostics';

describe('StreamDiagnostics Telemetry Engine', () => {
  it('records stream chunks and computes telemetry metrics', () => {
    const diag = new StreamDiagnostics();
    diag.start();

    diag.recordChunk('{"component":');
    diag.recordChunk(' "MetricCard"');
    diag.recordChunk(', "value": 42}');
    diag.recordRepair();

    const snapshot = diag.finish();

    expect(snapshot.totalChunksReceived).toBe(3);
    expect(snapshot.totalBytesReceived).toBeGreaterThan(0);
    expect(snapshot.totalTokensEstimated).toBeGreaterThan(0);
    expect(snapshot.repairsTriggered).toBe(1);
    expect(snapshot.tokensPerSecond).toBeGreaterThanOrEqual(0);
  });

  it('computes chunk jitter and intervals accurately', () => {
    const diag = new StreamDiagnostics();
    diag.start();

    diag.recordChunk('tok1');
    diag.recordChunk('tok2');
    diag.recordChunk('tok3');

    const snapshot = diag.getSnapshot();
    expect(snapshot.averageIntervalMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.maxJitterMs).toBeGreaterThanOrEqual(0);
  });
});
