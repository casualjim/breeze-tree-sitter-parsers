#!/usr/bin/env node

/**
 * Updates the package scope across all files
 */

const fs = require('fs');
const path = require('path');

function updateScope(oldScope, newScope) {
  const files = [
    'package.json',
    'index.js',
    'create-platform-packages.js',
    'publish-packages.sh',
    'test-distribution.js',
    'README.md',
    'CLAUDE.md'
  ];

  for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${file} - not found`);
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Replace all occurrences
    content = content.replace(new RegExp(oldScope, 'g'), newScope);

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      console.log(`Updated ${file}`);
    } else {
      console.log(`No changes in ${file}`);
    }
  }

  console.log('\nDone! Please review the changes and test before publishing.');
}

// Parse command line args
const args = process.argv.slice(2);

if (args.length !== 2) {
  console.log('Usage: node update-package-scope.js <old-scope> <new-scope>');
  console.log('Example: node update-package-scope.js @breeze @casualjim');
  console.log('\nCurrent scope: @breeze');
  console.log('\nSuggested alternatives:');
  console.log('  - Unscoped: tree-sitter-unified-parsers');
  console.log('  - Personal: @casualjim/tree-sitter-parsers');
  console.log('  - Community: @tree-sitter-community/parsers');
  console.log('  - Project: @breeze-editor/tree-sitter-parsers');
  process.exit(1);
}

const [oldScope, newScope] = args;

console.log(`Updating package scope from "${oldScope}" to "${newScope}"`);
console.log('This will update all references in:');
console.log('  - package.json');
console.log('  - index.js');
console.log('  - create-platform-packages.js');
console.log('  - publish-packages.sh');
console.log('  - test-distribution.js');
console.log('  - README.md');
console.log('  - CLAUDE.md');
console.log('');

// Confirm
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Continue? (y/n) ', (answer) => {
  rl.close();
  if (answer.toLowerCase() === 'y') {
    updateScope(oldScope, newScope);
  } else {
    console.log('Cancelled');
  }
});