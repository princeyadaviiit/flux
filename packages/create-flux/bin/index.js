#!/usr/bin/env node

const { runCLI } = require('@fluxmesh/cli');

runCLI(process.argv.slice(2)).catch((err) => {
  console.error('[create-fluxmesh] Error:', err.message || err);
  process.exit(1);
});
