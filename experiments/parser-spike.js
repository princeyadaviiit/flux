/**
 * Phase 0 Spike: Partial JSON Parser Decision
 *
 * Goal: Decide between hand-rolling parser or adapting existing tolerant-JSON library
 * Per TRD §4.3: Need incremental parsing with repair heuristics and schema validation
 *
 * Requirements:
 * 1. Parse incomplete JSON (streaming tokens)
 * 2. Repair heuristics (close quotes, brackets)
 * 3. Validate against partial schemas
 * 4. Emit progressive updates as props arrive
 */

console.log('\n=== Phase 0 Spike: Partial JSON Parser Decision ===\n');

/**
 * APPROACH 1: Hand-rolled Incremental Parser
 */

class IncrementalJSONParser {
  constructor() {
    this.buffer = '';
    this.lastValidObject = null;
  }

  /**
   * Add new tokens to the buffer and attempt parse
   */
  addChunk(chunk) {
    this.buffer += chunk;
    return this.tryParse();
  }

  /**
   * Attempt to parse the current buffer
   * Returns { success: boolean, data?: any, partial?: any }
   */
  tryParse() {
    // First, try direct parse
    try {
      const result = JSON.parse(this.buffer);
      this.lastValidObject = result;
      return { success: true, data: result, complete: true };
    } catch (e) {
      // Direct parse failed, try repair
    }

    // Try repair heuristics
    const repaired = this.repair(this.buffer);

    if (repaired) {
      try {
        const result = JSON.parse(repaired);
        return { success: true, data: result, complete: false, repaired: true };
      } catch (e) {
        // Repair didn't help
      }
    }

    // Can't parse yet, return last known state
    return {
      success: false,
      data: this.lastValidObject,
      waiting: true
    };
  }

  /**
   * Repair heuristics for incomplete JSON
   */
  repair(text) {
    let repaired = text.trim();

    // Heuristic 1: Close open string literals
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }

    // Heuristic 2: Close open objects/arrays using a stack
    const stack = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') stack.pop();
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') stack.pop();
      }
    }

    // Close remaining open brackets
    while (stack.length > 0) {
      const open = stack.pop();
      repaired += open === '{' ? '}' : ']';
    }

    // Heuristic 3: Remove trailing comma before closing brackets
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    return repaired;
  }

  reset() {
    this.buffer = '';
    this.lastValidObject = null;
  }
}

/**
 * APPROACH 2: Research Existing Libraries
 */

console.log('📚 Research: Existing Tolerant JSON Libraries\n');

const existingLibraries = [
  {
    name: 'jsonrepair',
    size: '~25KB',
    pros: [
      'Specifically designed for repairing malformed JSON',
      'Handles many edge cases',
      'Well-tested in production'
    ],
    cons: [
      'Not designed for streaming/incremental parsing',
      'Repairs complete strings, not partial buffers',
      'Additional dependency'
    ]
  },
  {
    name: 'json-parse-better-errors',
    size: '~10KB',
    pros: [
      'Better error messages',
      'Small footprint'
    ],
    cons: [
      'Only improves errors, doesn\'t repair',
      'Not suitable for partial/streaming JSON'
    ]
  },
  {
    name: 'Custom streaming parser',
    size: '~5-10KB (estimated)',
    pros: [
      'Full control over repair heuristics',
      'Optimized for Flux\'s specific use case',
      'No external dependency',
      'Can integrate schema validation directly',
      'Can emit progressive updates efficiently'
    ],
    cons: [
      'Must implement and maintain ourselves',
      'Need comprehensive test suite',
      'Potential for edge cases we don\'t anticipate'
    ]
  }
];

existingLibraries.forEach((lib, i) => {
  console.log(`${i + 1}. ${lib.name} (${lib.size})`);
  console.log('   Pros:');
  lib.pros.forEach(pro => console.log(`     + ${pro}`));
  console.log('   Cons:');
  lib.cons.forEach(con => console.log(`     - ${con}`));
  console.log('');
});

/**
 * TEST SUITE: Validate hand-rolled parser
 */

console.log('🧪 Testing Hand-rolled Parser\n');

function test(name, fn) {
  try {
    fn();
    console.log(`   ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`   ✗ ${name}`);
    console.log(`     ${error.message}`);
    return false;
  }
}

function assertEqual(actual, expected, message = '') {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
  }
}

const testResults = [];

// Test 1: Complete JSON
testResults.push(test('Parses complete JSON', () => {
  const parser = new IncrementalJSONParser();
  const result = parser.addChunk('{"name": "Alice"}');

  if (!result.success) throw new Error('Should parse complete JSON');
  assertEqual(result.data, { name: 'Alice' });
}));

// Test 2: Incomplete string
testResults.push(test('Repairs incomplete string', () => {
  const parser = new IncrementalJSONParser();
  const result = parser.addChunk('{"name": "Ali');

  if (!result.success) throw new Error('Should repair incomplete string');
  if (!result.repaired) throw new Error('Should mark as repaired');
  assertEqual(result.data, { name: 'Ali' });
}));

// Test 3: Incomplete object
testResults.push(test('Repairs incomplete object', () => {
  const parser = new IncrementalJSONParser();
  const result = parser.addChunk('{"name": "Alice", "age": 30');

  if (!result.success) throw new Error('Should repair incomplete object');
  assertEqual(result.data, { name: 'Alice', age: 30 });
}));

// Test 4: Nested incomplete structure
testResults.push(test('Repairs nested incomplete structure', () => {
  const parser = new IncrementalJSONParser();
  const result = parser.addChunk('{"user": {"name": "Alice"');

  if (!result.success) throw new Error('Should repair nested structure');
  assertEqual(result.data, { user: { name: 'Alice' } });
}));

// Test 5: Incomplete array
testResults.push(test('Repairs incomplete array', () => {
  const parser = new IncrementalJSONParser();
  const result = parser.addChunk('{"items": ["a", "b"');

  if (!result.success) throw new Error('Should repair incomplete array');
  assertEqual(result.data, { items: ['a', 'b'] });
}));

// Test 6: Progressive updates (streaming)
testResults.push(test('Handles progressive streaming', () => {
  const parser = new IncrementalJSONParser();

  // First chunk - incomplete
  let result = parser.addChunk('{"component": "Card');
  if (!result.success) throw new Error('Should repair first chunk');

  // Second chunk - add more
  result = parser.addChunk('", "title": "Hello');
  if (!result.success) throw new Error('Should repair second chunk');

  // Third chunk - complete
  result = parser.addChunk('"}');
  if (!result.success) throw new Error('Should parse complete');
  assertEqual(result.data, { component: 'Card", "title": "Hello' });

  // Note: This test reveals a limitation - the buffer accumulates!
  // A real streaming parser needs to handle this differently
}));

// Test 7: Trailing comma
testResults.push(test('Removes trailing comma', () => {
  const parser = new IncrementalJSONParser();
  const result = parser.addChunk('{"name": "Alice",}');

  if (!result.success) throw new Error('Should handle trailing comma');
  assertEqual(result.data, { name: 'Alice' });
}));

const passed = testResults.filter(r => r).length;
const total = testResults.length;

console.log(`\n   Results: ${passed}/${total} tests passed\n`);

/**
 * DECISION MATRIX
 */

console.log('📊 Decision Matrix\n');

const criteria = [
  {
    criterion: 'Streaming support',
    handRolled: 'Full control',
    existing: 'Limited/None',
    weight: 10
  },
  {
    criterion: 'Schema integration',
    handRolled: 'Direct integration',
    existing: 'Separate layer needed',
    weight: 8
  },
  {
    criterion: 'Bundle size',
    handRolled: '~5-10KB',
    existing: '~25KB+',
    weight: 6
  },
  {
    criterion: 'Maintenance burden',
    handRolled: 'High (we own it)',
    existing: 'Low (community)',
    weight: 7
  },
  {
    criterion: 'Time to implement',
    handRolled: '~1 week',
    existing: '~1 day',
    weight: 5
  },
  {
    criterion: 'Edge case coverage',
    handRolled: 'Unknown (need testing)',
    existing: 'Battle-tested',
    weight: 8
  },
  {
    criterion: 'Flux-specific optimization',
    handRolled: 'Perfect fit',
    existing: 'Generic solution',
    weight: 9
  }
];

console.log('Criterion                      | Hand-rolled        | Existing Library   | Weight');
console.log('-------------------------------|--------------------|--------------------|-------');
criteria.forEach(c => {
  const criterion = c.criterion.padEnd(30);
  const hr = c.handRolled.padEnd(18);
  const ex = c.existing.padEnd(18);
  console.log(`${criterion} | ${hr} | ${ex} | ${c.weight}/10`);
});

/**
 * RECOMMENDATION
 */

console.log('\n=== Recommendation ===\n');

console.log('✓ DECISION: Hand-roll a custom incremental parser\n');

console.log('Rationale:');
console.log('  1. Streaming/incremental parsing is a core requirement');
console.log('     → Existing libraries are not designed for this use case');
console.log('');
console.log('  2. Direct schema validation integration needed');
console.log('     → Hand-rolled parser can validate while parsing');
console.log('');
console.log('  3. Bundle size matters for DX goal');
console.log('     → Custom parser: ~5-10KB vs existing ~25KB+');
console.log('');
console.log('  4. Flux has specific repair heuristics');
console.log('     → TRD §4.3 specifies exact repair order and validation strategy');
console.log('');
console.log('  5. Progressive emit optimization');
console.log('     → Can emit prop updates incrementally, not just full objects');
console.log('');

console.log('Implementation approach:');
console.log('  • Phase 3, Week 9: Implement core parser with repair heuristics');
console.log('  • Use property-based testing (fuzz random truncation points)');
console.log('  • Integrate with Zod/schema validation directly in parse loop');
console.log('  • Build comprehensive test suite covering edge cases');
console.log('  • Consider jsonrepair as reference for edge case handling');
console.log('');

console.log('Risks & Mitigation:');
console.log('  Risk: May miss edge cases that existing libraries handle');
console.log('  Mitigation: Property-based fuzz testing + security audit in Phase 3');
console.log('');
console.log('  Risk: Maintenance burden');
console.log('  Mitigation: Well-tested, well-documented code; parser is isolated module');
console.log('');

console.log('This decision aligns with RULES.md §1.2 (security) and PRD §6 (zero-config DX).');
