#!/usr/bin/env node

const { runCLI } = require('../dist/index.js');

runCLI(process.argv.slice(2)).catch((err) => {
  console.error('[create-flux-app] Error:', err.message || err);
  process.exit(1);
});
