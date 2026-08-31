/**
 * StreamingUIParser Unit & Property-Based Tests
 * Validates streaming JSON parsing and repair heuristics per TRD §4.3
 */

import { describe, it, expect, vi } from 'vitest';
import { StreamingUIParser } from './StreamingUIParser';

describe('StreamingUIParser', () => {
  it('should parse complete JSON immediately', () => {
    const parser = new StreamingUIParser();
    const result = parser.addChunk('{"component": "Card", "title": "Dashboard", "count": 5}');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      component: 'Card',
      title: 'Dashboard',
      count: 5,
    });
  });

  it('should repair incomplete string literals', () => {
    const parser = new StreamingUIParser();
    const result = parser.addChunk('{"component": "Button", "label": "Subm');

    expect(result.success).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.data).toEqual({
      component: 'Button',
      label: 'Subm',
    });
  });

  it('should handle unclosed objects and arrays', () => {
    const parser = new StreamingUIParser();
    const result = parser.addChunk('{"component": "List", "items": ["item1", "item2"');

    expect(result.success).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.data).toEqual({
      component: 'List',
      items: ['item1', 'item2'],
    });
  });

  it('should handle nested unclosed objects', () => {
    const parser = new StreamingUIParser();
    const result = parser.addChunk('{"component": "UserCard", "user": {"name": "Alice", "meta": {"role": "adm');

    expect(result.success).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.data).toEqual({
      component: 'UserCard',
      user: {
        name: 'Alice',
        meta: { role: 'adm' },
      },
    });
  });

  it('should handle trailing commas cleanly', () => {
    const parser = new StreamingUIParser();
    const result = parser.addChunk('{"component": "Card", "title": "Done",}');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      component: 'Card',
      title: 'Done',
    });
  });

  it('should handle trailing colon and dangling key', () => {
    const parser = new StreamingUIParser();
    const result = parser.addChunk('{"component": "Form", "action": "/submit", "disabled":');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      component: 'Form',
      action: '/submit',
      disabled: null,
    });
  });

  it('should emit mount and diff events progressively during stream', () => {
    const parser = new StreamingUIParser();
    const mountFn = vi.fn();
    const diffFn = vi.fn();

    parser.onMount(mountFn);
    parser.onDiff(diffFn);

    // Chunk 1: component discriminant arrives
    parser.addChunk('{"component": "Chart", "type": "bar"');
    expect(mountFn).toHaveBeenCalledTimes(1);
    expect(mountFn).toHaveBeenCalledWith('Chart', { component: 'Chart', type: 'bar' });

    // Chunk 2: title prop arrives
    parser.addChunk(', "title": "Sales"');
    expect(diffFn).toHaveBeenCalledWith(
      { title: 'Sales' },
      { component: 'Chart', type: 'bar', title: 'Sales' }
    );

    // Chunk 3: data points arrive
    parser.addChunk(', "data": [10, 20, 30]}');
    const completeResult = parser.complete();

    expect(completeResult.complete).toBe(true);
    expect(completeResult.data).toEqual({
      component: 'Chart',
      type: 'bar',
      title: 'Sales',
      data: [10, 20, 30],
    });
  });

  it('should fuzz-test random token cuts on complex UI schema', () => {
    const fullJson = JSON.stringify({
      component: 'ComplexDashboard',
      title: 'Realtime Analytics',
      widgets: [
        { id: 1, name: 'CPU Usage', value: 78.5, status: 'warning' },
        { id: 2, name: 'Memory', value: 45.2, status: 'healthy' },
      ],
      settings: {
        refreshInterval: 1000,
        theme: 'dark',
        notifications: true,
      },
    });

    // Truncate at every single character point from index 15 to end
    for (let cut = 15; cut < fullJson.length; cut += 5) {
      const partial = fullJson.slice(0, cut);
      const parser = new StreamingUIParser();
      const result = parser.addChunk(partial);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        if (cut >= 35) {
          expect(result.data.component).toBe('ComplexDashboard');
        } else {
          expect(typeof result.data.component).toBe('string');
        }
      }
    }
  });

  it('should reset properly for fresh streams', () => {
    const parser = new StreamingUIParser();
    parser.addChunk('{"component": "A", "val": 1}');
    parser.reset();

    expect(parser.getStatus()).toBe('idle');
    expect(parser.getBuffer()).toBe('');
    expect(parser.getCurrentState()).toBeNull();

    const newResult = parser.addChunk('{"component": "B", "val": 2}');
    expect(newResult.data).toEqual({ component: 'B', val: 2 });
  });
});
