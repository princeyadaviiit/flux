/**
 * Flux Sanitizer
 * Mandatory sanitization for all LLM-authored markup props
 * Enforces RULES.md §1.2: "MUST pass every LLM-authored string destined for an HTML-producing prop through sanitize()"
 */

import DOMPurify from 'dompurify';

export interface SanitizeOptions {
  /** Allowed HTML tags. Defaults to safe standard list */
  allowedTags?: string[];
  /** Allowed HTML attributes */
  allowedAttributes?: string[];
  /** Allow iframe elements (default: false) */
  allowIframes?: boolean;
}

const DEFAULT_PURIFY_CONFIG: Record<string, any> = {
  ALLOWED_TAGS: [
    'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
    'span', 'div', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class', 'style'],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
};

// Lazy initialization of purify instance
let purifyInstance: { sanitize: (dirty: string, cfg?: any) => string } | null = null;

function getPurifyInstance(): { sanitize: (dirty: string, cfg?: any) => string } {
  if (purifyInstance) {
    return purifyInstance;
  }

  if (typeof window !== 'undefined' && (window as any).DOMPurify) {
    purifyInstance = (window as any).DOMPurify;
    return purifyInstance!;
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    purifyInstance = (DOMPurify as any)(window);
    return purifyInstance!;
  }

  // Node.js environment - initialize with JSDOM
  try {
    const { JSDOM } = require('jsdom');
    const domWindow = new JSDOM('').window;
    purifyInstance = (DOMPurify as any)(domWindow);
    return purifyInstance!;
  } catch (err) {
    // Fallback if jsdom is not available
    purifyInstance = {
      sanitize: (dirty: string) => {
        if (typeof dirty !== 'string') return '';
        return dirty
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/on\w+="[^"]*"/gi, '')
          .replace(/on\w+='[^']*'/gi, '')
          .replace(/on\w+=\S+/gi, '')
          .replace(/javascript:[^"']*/gi, '');
      },
    };
    return purifyInstance!;
  }
}

/**
 * Sanitizes untrusted LLM-authored HTML strings before they reach the DOM.
 * 
 * @param dirty - Untrusted HTML string
 * @param options - Customization options
 * @returns Safe sanitized HTML string
 */
export function sanitize(dirty: string, options?: SanitizeOptions): string {
  if (typeof dirty !== 'string') {
    return '';
  }

  if (!dirty.trim()) {
    return '';
  }

  const config: Record<string, any> = { ...DEFAULT_PURIFY_CONFIG };

  if (options?.allowedTags) {
    config.ALLOWED_TAGS = options.allowedTags;
  }

  if (options?.allowedAttributes) {
    config.ALLOWED_ATTR = options.allowedAttributes;
  }

  if (options?.allowIframes) {
    config.FORBID_TAGS = (config.FORBID_TAGS || []).filter((tag: string) => tag !== 'iframe');
    config.ALLOWED_TAGS = [...(config.ALLOWED_TAGS || []), 'iframe'];
  }

  const purifier = getPurifyInstance();
  return purifier.sanitize(dirty, config);
}

/**
 * Helper to sanitize specific rich-text fields in a prop object.
 * 
 * @param props - Component props object
 * @param richTextKeys - List of prop keys that contain markup
 * @returns Cleaned props object with sanitized rich text
 */
export function sanitizeProps<T extends Record<string, any>>(
  props: T,
  richTextKeys: string[]
): T {
  if (!props || typeof props !== 'object') {
    return props;
  }

  const sanitized = { ...props } as Record<string, any>;

  for (const key of richTextKeys) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitize(sanitized[key]);
    }
  }

  return sanitized as T;
}
