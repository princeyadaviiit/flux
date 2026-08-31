/**
 * Sanitizer Adversarial Security Tests
 * Validates that all XSS injection vectors are neutralized per TRD §7 & RULES.md §1.2
 */

import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeProps } from './sanitizer';

describe('Sanitizer Security Tests', () => {
  it('should remove inline script tags', () => {
    const dirty = '<p>Hello <script>alert("xss")</script>World</p>';
    const clean = sanitize(dirty);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('alert');
    expect(clean).toContain('Hello');
    expect(clean).toContain('World');
  });

  it('should strip onerror and inline event handlers from images', () => {
    const dirty = '<img src="invalid" onerror="alert(document.cookie)" />Hello';
    const clean = sanitize(dirty);
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('alert');
  });

  it('should strip onload attributes from svg or elements', () => {
    const dirty = '<svg onload="alert(1)"><circle cx="10" cy="10" r="5"/></svg>';
    const clean = sanitize(dirty);
    expect(clean).not.toContain('onload');
    expect(clean).not.toContain('alert');
  });

  it('should neutralize javascript: URLs in anchor hrefs', () => {
    const dirty = '<a href="javascript:alert(1)">Click Me</a>';
    const clean = sanitize(dirty);
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('Click Me');
  });

  it('should strip onclick and other event attributes', () => {
    const dirty = '<button onclick="fetch(\'/steal\')">Buy Now</button>';
    const clean = sanitize(dirty);
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('/steal');
  });

  it('should preserve safe formatting tags and text', () => {
    const dirty = '<h3>Title</h3><p>This is <strong>bold</strong> and <em>italic</em> with a <a href="https://example.com">link</a>.</p>';
    const clean = sanitize(dirty);
    expect(clean).toContain('<h3>Title</h3>');
    expect(clean).toContain('<strong>bold</strong>');
    expect(clean).toContain('<em>italic</em>');
    expect(clean).toContain('<a href="https://example.com"');
  });

  it('should handle empty, null, or non-string inputs safely', () => {
    expect(sanitize('')).toBe('');
    expect(sanitize('   ')).toBe('');
    expect(sanitize(null as any)).toBe('');
    expect(sanitize(undefined as any)).toBe('');
    expect(sanitize(123 as any)).toBe('');
  });

  it('should sanitize marked props with sanitizeProps', () => {
    const props = {
      title: 'Normal Title',
      content: '<p>Safe</p><script>evil()</script>',
      description: '<b onclick="bad()">Desc</b>',
      count: 42,
    };

    const sanitized = sanitizeProps(props, ['content', 'description']);

    expect(sanitized.title).toBe('Normal Title');
    expect(sanitized.count).toBe(42);
    expect(sanitized.content).not.toContain('<script>');
    expect(sanitized.content).toContain('<p>Safe</p>');
    expect(sanitized.description).not.toContain('onclick');
    expect(sanitized.description).toMatch(/<b\s*>Desc<\/b>/);
  });
});
