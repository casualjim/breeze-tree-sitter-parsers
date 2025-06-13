#!/usr/bin/env node

try {
  const { binaryPath } = require('../index.js');
  console.log(binaryPath);
  process.exit(0);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}