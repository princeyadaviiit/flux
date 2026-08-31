/**
 * StreamDiagnostics
 * Telemetry and real-time streaming health diagnostics.
 * Specifications: TRD §4.1, §7, §8
 */

export interface StreamMetricSnapshot {
  totalBytesReceived: number;
  totalChunksReceived: number;
  totalTokensEstimated: number;
  tokensPerSecond: number;
  averageChunkSize: number;
  averageIntervalMs: number;
  maxJitterMs: number;
  repairsTriggered: number;
  activeDurationMs: number;
}

export class StreamDiagnostics {
  private startTime: number = 0;
  private lastChunkTime: number = 0;
  private totalBytes: number = 0;
  private totalChunks: number = 0;
  private intervals: number[] = [];
  private repairsCount: number = 0;
  private isStreaming: boolean = false;

  /**
   * Start or reset diagnostic tracking for a stream
   */
  public start(): void {
    this.startTime = Date.now();
    this.lastChunkTime = this.startTime;
    this.totalBytes = 0;
    this.totalChunks = 0;
    this.intervals = [];
    this.repairsCount = 0;
    this.isStreaming = true;
  }

  /**
   * Record arrival of a streaming chunk
   */
  public recordChunk(chunk: string): void {
    const now = Date.now();
    if (!this.isStreaming) {
      this.start();
    }

    if (this.lastChunkTime > 0) {
      const interval = now - this.lastChunkTime;
      this.intervals.push(interval);
    }

    this.lastChunkTime = now;
    this.totalBytes += chunk.length;
    this.totalChunks++;
  }

  /**
   * Record when a parser repair heuristic is triggered
   */
  public recordRepair(): void {
    this.repairsCount++;
  }

  /**
   * End stream tracking
   */
  public finish(): StreamMetricSnapshot {
    this.isStreaming = false;
    return this.getSnapshot();
  }

  /**
   * Get current telemetry metrics snapshot
   */
  public getSnapshot(): StreamMetricSnapshot {
    const now = Date.now();
    const durationMs = Math.max(1, now - (this.startTime || now));
    const durationSec = durationMs / 1000;

    // Approximate ~4 characters per token
    const estimatedTokens = Math.round(this.totalBytes / 4);
    const tokensPerSec = Number((estimatedTokens / durationSec).toFixed(2));

    const avgChunkSize = this.totalChunks > 0 ? Math.round(this.totalBytes / this.totalChunks) : 0;

    const avgInterval =
      this.intervals.length > 0
        ? Math.round(this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length)
        : 0;

    let maxJitter = 0;
    if (this.intervals.length > 1) {
      for (let i = 1; i < this.intervals.length; i++) {
        const jitter = Math.abs(this.intervals[i] - this.intervals[i - 1]);
        if (jitter > maxJitter) maxJitter = jitter;
      }
    }

    return {
      totalBytesReceived: this.totalBytes,
      totalChunksReceived: this.totalChunks,
      totalTokensEstimated: estimatedTokens,
      tokensPerSecond: tokensPerSec,
      averageChunkSize: avgChunkSize,
      averageIntervalMs: avgInterval,
      maxJitterMs: maxJitter,
      repairsTriggered: this.repairsCount,
      activeDurationMs: durationMs,
    };
  }
}
