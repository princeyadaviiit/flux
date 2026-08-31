/**
 * FluxRenderer Unit Tests
 * Validates component registration, progressive validation, sanitization, and fallback behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { FluxRenderer } from './FluxRenderer';
import { StreamingUIParser } from './StreamingUIParser';

describe('FluxRenderer', () => {
  it('should register and render a component successfully', () => {
    const renderer = new FluxRenderer();
    const renderFn = vi.fn();
    renderer.onRender(renderFn);

    renderer.register('MetricCard', {
      component: 'MetricCardTemplate',
      schema: (props: any, isPartial: boolean) => {
        if (!isPartial && !props.value) {
          return { valid: false, errors: ['Missing required value'] };
        }
        return { valid: true, data: props };
      },
    });

    const descriptor = renderer.handleParseResult({
      success: true,
      data: { component: 'MetricCard', title: 'Revenue', value: '$50,000' },
      complete: true,
    });

    expect(descriptor).not.toBeNull();
    expect(descriptor?.componentName).toBe('MetricCard');
    expect(descriptor?.component).toBe('MetricCardTemplate');
    expect(descriptor?.isFallback).toBe(false);
    expect(renderFn).toHaveBeenCalledWith(descriptor);
  });

  it('should allow partial props during streaming and validate strictly on completion', () => {
    const renderer = new FluxRenderer();

    renderer.register('UserForm', {
      component: 'UserFormComponent',
      schema: (props: any, isPartial: boolean) => {
        // While streaming (isPartial = true), username is not strictly required yet
        if (!isPartial) {
          if (!props.username || !props.email) {
            return { valid: false, errors: ['username and email required'] };
          }
        }
        return { valid: true, data: props };
      },
    });

    // 1. Partial chunk during streaming: only username is present
    const partialDescriptor = renderer.handleParseResult({
      success: true,
      data: { component: 'UserForm', username: 'alice' },
      complete: false,
    });

    expect(partialDescriptor?.isFallback).toBe(false);
    expect(partialDescriptor?.props.username).toBe('alice');

    // 2. Stream completes but missing required email -> fallback rendered
    const invalidCompleteDescriptor = renderer.handleParseResult({
      success: true,
      data: { component: 'UserForm', username: 'alice' },
      complete: true,
    });

    expect(invalidCompleteDescriptor?.isFallback).toBe(true);
    expect(invalidCompleteDescriptor?.error).toContain('Schema validation failed');
  });

  it('should render fallback component when an unknown component is requested', () => {
    const renderer = new FluxRenderer();

    const descriptor = renderer.handleParseResult({
      success: true,
      data: { component: 'NonExistentWidget', someProp: 123 },
      complete: true,
    });

    expect(descriptor?.isFallback).toBe(true);
    expect(descriptor?.componentName).toBe('FluxFallbackError');
    expect(descriptor?.error).toContain("Unknown component 'NonExistentWidget'");
  });

  it('should automatically sanitize richTextProps before emission', () => {
    const renderer = new FluxRenderer();

    renderer.register('ArticleCard', {
      component: 'ArticleComponent',
      richTextProps: ['summary', 'content'],
    });

    const descriptor = renderer.handleParseResult({
      success: true,
      data: {
        component: 'ArticleCard',
        title: 'Safe Title',
        summary: '<p>Intro</p><script>alert("xss")</script>',
        content: '<b onclick="steal()">Click</b>',
      },
      complete: true,
    });

    expect(descriptor?.props.title).toBe('Safe Title');
    expect(descriptor?.props.summary).not.toContain('<script>');
    expect(descriptor?.props.summary).toContain('<p>Intro</p>');
    expect(descriptor?.props.content).not.toContain('onclick');
    expect(descriptor?.props.content).toContain('<b>Click</b>');
  });

  it('should pipe StreamingUIParser stream into FluxRenderer', () => {
    const renderer = new FluxRenderer();
    const parser = new StreamingUIParser();
    const renderFn = vi.fn();

    renderer.register('LiveAlert', {
      component: 'AlertComponent',
    });

    renderer.onRender(renderFn);
    renderer.attachParser(parser);

    parser.addChunk('{"component": "LiveAlert", "level": "warn"');
    expect(renderFn).toHaveBeenCalled();
    const lastCall = renderFn.mock.calls[renderFn.mock.calls.length - 1][0];
    expect(lastCall.componentName).toBe('LiveAlert');
    expect(lastCall.props.level).toBe('warn');
  });
});
