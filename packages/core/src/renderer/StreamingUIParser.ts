/**
 * StreamingUIParser
 * Incremental JSON parser with bounded repair heuristics for LLM token streams.
 * Specifications: TRD §4.3, PRD FR-3.1, FR-3.3
 */

export type StreamStatus = 'idle' | 'streaming' | 'complete' | 'error' | 'stalled';

export interface ParseResult<T = any> {
  /** Whether parsing (direct or repaired) succeeded */
  success: boolean;
  /** Parsed (and potentially repaired) data object */
  data: T | null;
  /** Whether the stream is complete */
  complete: boolean;
  /** Whether repair heuristics were applied to achieve successful parse */
  repaired?: boolean;
  /** Newly changed or added props since last emission */
  diff?: Record<string, any>;
  /** Error message if parsing failed */
  error?: string;
}

export type ParseListener<T = any> = (result: ParseResult<T>) => void;
export type MountListener<T = any> = (componentName: string, initialProps: T) => void;
export type DiffListener = (diff: Record<string, any>, fullState: any) => void;

export class StreamingUIParser<T extends Record<string, any> = Record<string, any>> {
  private buffer: string = '';
  private lastEmittedState: any = null;
  private isMounted: boolean = false;
  private mountedComponent: string | null = null;
  private status: StreamStatus = 'idle';

  private parseListeners: Set<ParseListener<T>> = new Set();
  private mountListeners: Set<MountListener<T>> = new Set();
  private diffListeners: Set<DiffListener> = new Set();

  constructor() {
    this.reset();
  }

  /**
   * Append a new token or text chunk from the streaming LLM response
   */
  public addChunk(chunk: string): ParseResult<T> {
    if (!chunk && this.status !== 'idle') {
      return this.getCurrentResult();
    }

    this.buffer += chunk;
    this.status = 'streaming';

    return this.processBuffer(false);
  }

  /**
   * Mark stream as complete and execute final strict parse & validation
   */
  public complete(): ParseResult<T> {
    this.status = 'complete';
    return this.processBuffer(true);
  }

  /**
   * Reset parser state for a new stream
   */
  public reset(): void {
    this.buffer = '';
    this.lastEmittedState = null;
    this.isMounted = false;
    this.mountedComponent = null;
    this.status = 'idle';
  }

  /**
   * Current stream status
   */
  public getStatus(): StreamStatus {
    return this.status;
  }

  /**
   * Current raw buffer
   */
  public getBuffer(): string {
    return this.buffer;
  }

  /**
   * Get the current parsed object state
   */
  public getCurrentState(): T | null {
    return this.lastEmittedState;
  }

  /**
   * Get the currently mounted component name
   */
  public getMountedComponent(): string | null {
    return this.mountedComponent;
  }

  /**
   * Subscribe to parse result events
   */
  public onParse(listener: ParseListener<T>): () => void {
    this.parseListeners.add(listener);
    return () => this.parseListeners.delete(listener);
  }

  /**
   * Subscribe to component mount events
   */
  public onMount(listener: MountListener<T>): () => void {
    this.mountListeners.add(listener);
    return () => this.mountListeners.delete(listener);
  }

  /**
   * Subscribe to incremental prop diff events
   */
  public onDiff(listener: DiffListener): () => void {
    this.diffListeners.add(listener);
    return () => this.diffListeners.delete(listener);
  }

  /**
   * Process and attempt to parse the current buffer
   */
  private processBuffer(isComplete: boolean): ParseResult<T> {
    const trimmed = this.buffer.trim();
    if (!trimmed) {
      return { success: false, data: null, complete: isComplete };
    }

    // Attempt 1: Direct strict parse
    try {
      const data = JSON.parse(trimmed);
      return this.handleSuccessfulParse(data, isComplete, false);
    } catch {
      // Direct parse failed; proceed to repair
    }

    // Attempt 2: Bounded repair heuristics
    const repaired = this.repairJSON(trimmed);
    if (repaired) {
      try {
        const data = JSON.parse(repaired);
        return this.handleSuccessfulParse(data, isComplete, true);
      } catch {
        // Repair could not form valid JSON yet
      }
    }

    // If completely done and still can't parse, mark error
    if (isComplete) {
      this.status = 'error';
      const errorResult: ParseResult<T> = {
        success: false,
        data: this.lastEmittedState,
        complete: true,
        error: 'Failed to parse JSON stream upon completion',
      };
      this.notifyParse(errorResult);
      return errorResult;
    }

    // In-flight chunk waiting for more tokens
    const waitingResult: ParseResult<T> = {
      success: false,
      data: this.lastEmittedState,
      complete: false,
    };
    return waitingResult;
  }

  /**
   * Handles a successfully parsed (or repaired) object
   */
  private handleSuccessfulParse(
    data: any,
    isComplete: boolean,
    repaired: boolean
  ): ParseResult<T> {
    if (typeof data !== 'object' || data === null) {
      return {
        success: true,
        data,
        complete: isComplete,
        repaired,
      };
    }

    // Compute diff against last emitted state
    const diff = this.computeDiff(this.lastEmittedState, data);
    const hasChanges = Object.keys(diff).length > 0 || this.lastEmittedState === null;

    // Check component discriminant mounting
    const componentName = data.component || data.type;
    if (componentName && typeof componentName === 'string' && !this.isMounted) {
      this.isMounted = true;
      this.mountedComponent = componentName;
      this.notifyMount(componentName, data);
    }

    this.lastEmittedState = data;

    if (hasChanges && this.isMounted) {
      this.notifyDiff(diff, data);
    }

    const result: ParseResult<T> = {
      success: true,
      data,
      complete: isComplete,
      repaired,
      diff: hasChanges ? diff : undefined,
    };

    this.notifyParse(result);
    return result;
  }

  /**
   * Bounded repair heuristics per TRD §4.3
   */
  public repairJSON(text: string): string | null {
    let s = text.trim();
    if (!s) return null;

    // Find starting brace / bracket if leading chars exist
    if (!s.startsWith('{') && !s.startsWith('[')) {
      const firstBrace = s.indexOf('{');
      const firstBracket = s.indexOf('[');
      let startIdx = -1;
      if (firstBrace !== -1 && firstBracket !== -1) {
        startIdx = Math.min(firstBrace, firstBracket);
      } else if (firstBrace !== -1) {
        startIdx = firstBrace;
      } else if (firstBracket !== -1) {
        startIdx = firstBracket;
      }

      if (startIdx !== -1) {
        s = s.substring(startIdx);
      } else {
        return null;
      }
    }

    const attemptRepair = (input: string): string | null => {
      const stack: string[] = [];
      let inString = false;
      let escaped = false;
      let lastToken = '';
      let isKey = false;

      for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          continue;
        }

        if (char === '"') {
          if (!inString) {
            inString = true;
            // If top of stack is '{' and previous structural token was '{' or ',', this is a key
            if (stack[stack.length - 1] === '{' && (lastToken === '{' || lastToken === ',')) {
              isKey = true;
            } else {
              isKey = false;
            }
          } else {
            inString = false;
            lastToken = '"';
          }
          continue;
        }

        if (inString) {
          continue;
        }

        if (char === '{' || char === '[') {
          stack.push(char);
          lastToken = char;
        } else if (char === '}') {
          if (stack.length > 0 && stack[stack.length - 1] === '{') {
            stack.pop();
          }
          lastToken = '}';
        } else if (char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === '[') {
            stack.pop();
          }
          lastToken = ']';
        } else if (char === ':') {
          lastToken = ':';
          isKey = false;
        } else if (char === ',') {
          lastToken = ',';
          isKey = false;
        }
      }

      let repaired = input;

      // 1. Close unclosed string
      if (inString) {
        repaired += '"';
        lastToken = '"';
      }

      // 2. Handle dangling key (e.g. {"key" inside object where isKey was true and no colon arrived)
      if (isKey && stack[stack.length - 1] === '{') {
        repaired += ': null';
        lastToken = 'null';
      }

      // 3. Handle trailing colon (e.g. {"key": )
      const trimmedEnd = repaired.trimEnd();
      if (trimmedEnd.endsWith(':')) {
        repaired = trimmedEnd + ' null';
      }

      // 4. Strip trailing commas
      repaired = repaired.replace(/,\s*$/g, '');

      // 5. Close brackets in reverse order
      const remainingStack = [...stack];
      while (remainingStack.length > 0) {
        const open = remainingStack.pop();
        repaired += open === '{' ? '}' : ']';
      }

      // 6. Clean dangling commas before closing brackets
      repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

      try {
        JSON.parse(repaired);
        return repaired;
      } catch {
        return null;
      }
    };

    // First attempt on full string
    const directResult = attemptRepair(s);
    if (directResult) return directResult;

    // Fallback: If partial invalid property at end, trim back to last comma or brace
    for (let cut = s.length - 1; cut > 0; cut--) {
      const char = s[cut];
      if (char === ',' || char === '{' || char === '[') {
        const trimmedCandidate = s.substring(0, char === ',' ? cut : cut + 1);
        const fallbackResult = attemptRepair(trimmedCandidate);
        if (fallbackResult) return fallbackResult;
      }
    }

    return null;
  }

  /**
   * Computes shallow & deep property differences between previous and current object
   */
  private computeDiff(oldObj: any, newObj: any): Record<string, any> {
    if (!oldObj || typeof oldObj !== 'object') {
      return { ...newObj };
    }

    if (!newObj || typeof newObj !== 'object') {
      return {};
    }

    const diff: Record<string, any> = {};

    for (const key of Object.keys(newObj)) {
      const oldVal = oldObj[key];
      const newVal = newObj[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diff[key] = newVal;
      }
    }

    return diff;
  }

  private getCurrentResult(): ParseResult<T> {
    return {
      success: this.lastEmittedState !== null,
      data: this.lastEmittedState,
      complete: this.status === 'complete',
    };
  }

  private notifyParse(result: ParseResult<T>): void {
    this.parseListeners.forEach(listener => {
      try {
        listener(result);
      } catch (err) {
        console.error('[StreamingUIParser] Listener error:', err);
      }
    });
  }

  private notifyMount(componentName: string, initialProps: T): void {
    this.mountListeners.forEach(listener => {
      try {
        listener(componentName, initialProps);
      } catch (err) {
        console.error('[StreamingUIParser] Mount listener error:', err);
      }
    });
  }

  private notifyDiff(diff: Record<string, any>, fullState: any): void {
    this.diffListeners.forEach(listener => {
      try {
        listener(diff, fullState);
      } catch (err) {
        console.error('[StreamingUIParser] Diff listener error:', err);
      }
    });
  }
}
