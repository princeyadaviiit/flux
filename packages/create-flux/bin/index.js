#!/usr/bin/env node

const { runCLI } = require('@flux/cli');

runCLI(process.argv.slice(2)).catch((err) => {
  console.error('[create-flux] Error:', err.message || err);
  process.exit(1);
});
