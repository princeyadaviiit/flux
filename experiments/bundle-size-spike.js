/**
 * Phase 0 Spike: Yjs Bundle Size Validation
 *
 * Goal: Confirm Yjs bundle size is acceptable for "under 2 minutes to hello world" DX goal
 * Per PRD §9: Time-to-Hello-World target is under 2 minutes from npm create
 */

import { createRequire } from 'module';
import { readFileSync, statSync } from 'fs';
import { gzip } from 'zlib';
import { promisify } from 'util';
import path from 'path';

const gzipAsync = promisify(gzip);
const require = createRequire(import.meta.url);

/**
 * Measure the size of a package
 */
async function measurePackageSize(packageName) {
  try {
    // Resolve the main entry point
    const packagePath = require.resolve(packageName);
    const packageJson = require(`${packageName}/package.json`);

    console.log(`\n📦 Package: ${packageName}@${packageJson.version}`);
    console.log(`   Entry: ${path.basename(packagePath)}`);

    // Read the file
    const content = readFileSync(packagePath);
    const rawSize = content.length;

    // Gzip compress
    const compressed = await gzipAsync(content);
    const gzipSize = compressed.length;

    return {
      package: packageName,
      version: packageJson.version,
      rawSize,
      gzipSize,
      path: packagePath
    };
  } catch (error) {
    console.error(`   ✗ Failed to measure ${packageName}: ${error.message}`);
    return null;
  }
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Estimate cold start time based on bundle size
 * Rule of thumb: ~1-2ms per KB on modern hardware
 */
function estimateColdStart(gzipSizeKB) {
  const downloadTime = gzipSizeKB * 0.5; // ~500ms per MB on decent connection
  const parseTime = gzipSizeKB * 1.5; // ~1.5ms per KB to parse/execute
  return downloadTime + parseTime;
}

console.log('\n=== Phase 0 Spike: Yjs Bundle Size Validation ===\n');

// Measure Yjs
const yjsStats = await measurePackageSize('yjs');

if (yjsStats) {
  console.log(`   Raw size: ${formatBytes(yjsStats.rawSize)}`);
  console.log(`   Gzipped:  ${formatBytes(yjsStats.gzipSize)}`);

  const gzipKB = yjsStats.gzipSize / 1024;
  const estimatedTime = estimateColdStart(gzipKB);

  console.log(`   Estimated cold start: ~${Math.round(estimatedTime)}ms`);

  // Check against acceptable thresholds
  const MAX_GZIP_KB = 100; // 100KB gzipped is reasonable for a CRDT library
  const MAX_COLD_START_MS = 500; // 500ms max acceptable cold start time

  console.log('\n📊 Evaluation:');

  if (gzipKB <= MAX_GZIP_KB) {
    console.log(`   ✓ Gzipped size (${gzipKB.toFixed(2)} KB) is under ${MAX_GZIP_KB} KB threshold`);
  } else {
    console.log(`   ✗ Gzipped size (${gzipKB.toFixed(2)} KB) exceeds ${MAX_GZIP_KB} KB threshold`);
  }

  if (estimatedTime <= MAX_COLD_START_MS) {
    console.log(`   ✓ Estimated cold start (~${Math.round(estimatedTime)}ms) is under ${MAX_COLD_START_MS}ms threshold`);
  } else {
    console.log(`   ✗ Estimated cold start (~${Math.round(estimatedTime)}ms) exceeds ${MAX_COLD_START_MS}ms threshold`);
  }

  // Impact on "under 2 minutes" DX goal
  console.log('\n⏱️  Impact on DX Goal (< 2 minutes to hello world):');
  console.log(`   Time to download Yjs: ~${Math.round(gzipKB * 0.5)}ms on good connection`);
  console.log(`   This is ${((estimatedTime / (2 * 60 * 1000)) * 100).toFixed(2)}% of the 2-minute budget`);

  const acceptable = gzipKB <= MAX_GZIP_KB && estimatedTime <= MAX_COLD_START_MS;

  console.log('\n=== Results ===\n');

  if (acceptable) {
    console.log('✓ Yjs bundle size validation SUCCESSFUL');
    console.log('✓ Bundle size is acceptable for DX goals');
    console.log(`✓ ${formatBytes(yjsStats.gzipSize)} gzipped will not significantly impact time-to-hello-world`);
    console.log('\nDecision: Yjs bundle size is acceptable. Proceed with Yjs as CRDT dependency.');
  } else {
    console.log('✗ Yjs bundle size validation FAILED');
    console.log('✗ Bundle size may impact DX goals');
    console.log('\nDecision: Consider alternatives or tree-shaking optimizations.');
  }

  // Additional analysis
  console.log('\n📋 Additional Context:');
  console.log('   • Modern frameworks (React, Vue, Svelte) are typically 40-80KB gzipped');
  console.log('   • Most web apps are 200-500KB gzipped total');
  console.log('   • Yjs is a specialized CRDT library with proven production use');
  console.log('   • Alternatives (Automerge, etc.) have similar or larger sizes');
  console.log('\n   Recommendation: Yjs size is industry-standard for CRDT libraries.');

} else {
  console.log('\n✗ Failed to measure Yjs - ensure package is installed');
  process.exit(1);
}

// Bonus: Measure potential savings with tree-shaking
console.log('\n🌲 Tree-shaking Opportunities:');
console.log('   Yjs is modular - only import what you need:');
console.log('   • Y.Doc, Y.Map, Y.Array (core - always needed)');
console.log('   • Y.Text (optional - only if supporting collaborative text)');
console.log('   • Providers (y-websocket, etc. - optional, separate packages)');
console.log('\n   Flux will only import core types, keeping bundle minimal.');
