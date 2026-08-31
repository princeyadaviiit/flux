/**
 * FluxRenderer
 * Declarative component registry and generative UI orchestrator.
 * Implements progressive schema validation, mandatory sanitization, and fallback rendering.
 * Specifications: TRD §4.3, PRD FR-3.1, FR-3.2, FR-3.3, RULES.md §1.2
 */

import { StreamingUIParser, ParseResult } from './StreamingUIParser';
import { sanitizeProps } from './sanitizer';

export type ValidatorFn<T = any> = (data: any, isPartial: boolean) => ValidationResult<T>;

export interface SchemaValidator<T = any> {
  safeParse?: (data: any) => { success: boolean; data?: T; error?: any };
  partial?: () => SchemaValidator<T>;
  validate?: ValidatorFn<T>;
}

export interface ValidationResult<T = any> {
  valid: boolean;
  data?: T;
  errors?: string[];
}

export interface ComponentRegistration<T = any> {
  /** Schema or validator for props */
  schema?: SchemaValidator<T> | ValidatorFn<T>;
  /** Component reference or template */
  component?: any;
  /** Prop keys containing LLM-authored rich text / HTML to sanitize */
  richTextProps?: string[];
  /** Is this component registered as the default fallback component? */
  isFallback?: boolean;
}

export interface RenderDescriptor<T = any> {
  componentName: string;
  component: any;
  props: T;
  isComplete: boolean;
  isFallback: boolean;
  error?: string;
}

export type RenderListener<T = any> = (descriptor: RenderDescriptor<T>) => void;

export class FluxRenderer {
  private registry: Map<string, ComponentRegistration> = new Map();
  private fallbackComponent: { name: string; registration: ComponentRegistration } | null = null;
  private renderListeners: Set<RenderListener> = new Set();

  constructor() {
    // Register standard default fallback component
    this.registerFallback('FluxFallbackError', {
      component: 'FluxFallbackError',
      richTextProps: ['message', 'details'],
      isFallback: true,
    });
  }

  /**
   * Register a component with its schema, renderer target, and sanitization configuration
   */
  public register<T = any>(name: string, registration: ComponentRegistration<T>): this {
    this.registry.set(name, registration);
    if (registration.isFallback) {
      this.fallbackComponent = { name, registration };
    }
    return this;
  }

  /**
   * Register default fallback error component
   */
  public registerFallback<T = any>(name: string, registration: ComponentRegistration<T>): this {
    registration.isFallback = true;
    this.registry.set(name, registration);
    this.fallbackComponent = { name, registration };
    return this;
  }

  /**
   * Get registration for component
   */
  public getRegistration(name: string): ComponentRegistration | undefined {
    return this.registry.get(name);
  }

  /**
   * Check if component is registered
   */
  public hasComponent(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * Subscribe to render descriptor updates
   */
  public onRender(listener: RenderListener): () => void {
    this.renderListeners.add(listener);
    return () => this.renderListeners.delete(listener);
  }

  /**
   * Connect a StreamingUIParser to this renderer and pipe parsed updates
   */
  public attachParser(parser: StreamingUIParser): () => void {
    const unsubParse = parser.onParse((parseResult: ParseResult) => {
      this.handleParseResult(parseResult);
    });

    return () => {
      unsubParse();
    };
  }

  /**
   * Process a parse result, validating schema, sanitizing rich text, and emitting render descriptor
   */
  public handleParseResult(result: ParseResult): RenderDescriptor | null {
    if (!result.success || !result.data) {
      if (result.complete && result.error) {
        return this.emitFallback(
          'StreamingError',
          { message: result.error, rawBuffer: '' },
          true,
          result.error
        );
      }
      return null;
    }

    const rawData = result.data;
    const componentName = rawData.component || rawData.type;

    if (!componentName || typeof componentName !== 'string') {
      return null;
    }

    const reg = this.registry.get(componentName);

    // If unknown component, render fallback per FR-3.3
    if (!reg) {
      return this.emitFallback(
        componentName,
        rawData,
        result.complete,
        `Unknown component '${componentName}'`
      );
    }

    // Validate schema (progressive / partial while streaming, full when complete)
    const validation = this.validateProps(reg, rawData, !result.complete);

    if (!validation.valid && result.complete) {
      // Full validation failed on completion -> degrade gracefully to fallback
      return this.emitFallback(
        componentName,
        rawData,
        true,
        `Schema validation failed for '${componentName}': ${validation.errors?.join(', ')}`
      );
    }

    // Sanitize any LLM-authored rich text props per RULES.md §1.2
    let safeProps = validation.data || rawData;
    if (reg.richTextProps && reg.richTextProps.length > 0) {
      safeProps = sanitizeProps(safeProps, reg.richTextProps);
    }

    const descriptor: RenderDescriptor = {
      componentName,
      component: reg.component,
      props: safeProps,
      isComplete: result.complete,
      isFallback: false,
    };

    this.notifyRender(descriptor);
    return descriptor;
  }

  /**
   * Validate props against schema (partial or full)
   */
  public validateProps(
    reg: ComponentRegistration,
    data: any,
    isPartial: boolean
  ): ValidationResult {
    if (!reg.schema) {
      return { valid: true, data };
    }

    // Function validator
    if (typeof reg.schema === 'function') {
      return reg.schema(data, isPartial);
    }

    // Schema with custom validate method
    if (typeof reg.schema.validate === 'function') {
      return reg.schema.validate(data, isPartial);
    }

    // Zod-like schema with .safeParse()
    if (typeof reg.schema.safeParse === 'function') {
      if (isPartial && typeof reg.schema.partial === 'function') {
        const partialSchema = reg.schema.partial();
        const parsed = partialSchema.safeParse?.(data);
        if (parsed) {
          return {
            valid: parsed.success,
            data: parsed.data ?? data,
            errors: parsed.error ? [String(parsed.error)] : undefined,
          };
        }
      }

      // If full or no partial method
      const parsed = reg.schema.safeParse(data);
      return {
        valid: parsed.success,
        data: parsed.data ?? data,
        errors: parsed.error ? [String(parsed.error)] : undefined,
      };
    }

    return { valid: true, data };
  }

  private emitFallback(
    originalName: string,
    rawProps: any,
    isComplete: boolean,
    errorMessage: string
  ): RenderDescriptor {
    const fallbackReg = this.fallbackComponent?.registration;
    const fallbackName = this.fallbackComponent?.name || 'FluxFallbackError';

    const fallbackProps = {
      originalComponent: originalName,
      message: errorMessage,
      rawProps,
    };

    const sanitizedProps = fallbackReg?.richTextProps
      ? sanitizeProps(fallbackProps, fallbackReg.richTextProps)
      : fallbackProps;

    const descriptor: RenderDescriptor = {
      componentName: fallbackName,
      component: fallbackReg?.component || fallbackName,
      props: sanitizedProps,
      isComplete,
      isFallback: true,
      error: errorMessage,
    };

    this.notifyRender(descriptor);
    return descriptor;
  }

  private notifyRender(descriptor: RenderDescriptor): void {
    this.renderListeners.forEach(listener => {
      try {
        listener(descriptor);
      } catch (err) {
        console.error('[FluxRenderer] Render listener error:', err);
      }
    });
  }
}
