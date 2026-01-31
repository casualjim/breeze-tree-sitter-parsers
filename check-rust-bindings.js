#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const grammars = JSON.parse(fs.readFileSync('grammars.json', 'utf8')).grammars;
const grammarsDir = path.join(__dirname, 'grammars');

let withRustBindings = 0;
let withoutRustBindings = 0;
const missingRustBindings = [];

function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

function shouldSkipDir(name) {
  return name.startsWith('.') || name === 'node_modules' || name === 'target';
}

// Find the first Cargo.toml within startDir, limited to `maxDirDepth` directories deep.
// maxDirDepth=0 checks only startDir/Cargo.toml
// maxDirDepth=1 checks startDir/*/Cargo.toml
// maxDirDepth=2 checks startDir/*/*/Cargo.toml
function findCargoTomlWithin(startDir, maxDirDepth) {
  const queue = [{ dir: startDir, depth: 0 }];

  while (queue.length) {
    const { dir, depth } = queue.shift();

    const cargoToml = path.join(dir, 'Cargo.toml');
    try {
      if (fs.existsSync(cargoToml) && fs.statSync(cargoToml).isFile()) {
        return cargoToml;
      }
    } catch {
      // ignore unreadable entries
    }

    if (depth >= maxDirDepth) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const subdirs = entries
      .filter((e) => e.isDirectory() && !shouldSkipDir(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    for (const subdir of subdirs) {
      queue.push({ dir: path.join(dir, subdir), depth: depth + 1 });
    }
  }

  return null;
}

for (const grammar of grammars) {
  const versionedDir = path.join(grammarsDir, grammar.name, grammar.rev);
  const grammarDir = versionedDir;

  if (!fs.existsSync(grammarDir)) {
    console.log(`MISSING DIR: ${grammar.name}`);
    continue;
  }

  // Check if there's a path specified in grammar.json
  const checkDir = grammar.path ? path.join(grammarDir, grammar.path) : grammarDir;

  if (!fs.existsSync(checkDir)) {
    console.log(`PATH NOT FOUND: ${grammar.name} - ${grammar.path || '<root>'}`);
    grammar.has_rust_bindings = false;
    delete grammar.cargo_toml_path;
    withoutRustBindings++;
    missingRustBindings.push(grammar.name);
    continue;
  }

  // First check the grammar directory (based on `.path` when present).
  // If not found, also check the repo root (some repos keep bindings at root).
  const cargoTomlAbs =
    findCargoTomlWithin(checkDir, 2) ||
    findCargoTomlWithin(grammarDir, 2);

  if (cargoTomlAbs) {
    const cargoTomlPath = toPosixPath(path.relative(checkDir, cargoTomlAbs));
    grammar.has_rust_bindings = true;
    grammar.cargo_toml_path = cargoTomlPath;
    withRustBindings++;
    console.log(`✓ ${grammar.name}: ${cargoTomlPath}`);
  } else {
    grammar.has_rust_bindings = false;
    delete grammar.cargo_toml_path;
    withoutRustBindings++;
    missingRustBindings.push(grammar.name);
  }
}

// Write updated grammars.json
fs.writeFileSync('grammars.json', JSON.stringify({ grammars }, null, 2));

console.log('\n================================');
console.log(`Total: ${grammars.length}`);
console.log(`With Rust bindings: ${withRustBindings}`);
console.log(`Without Rust bindings: ${withoutRustBindings}`);
if (missingRustBindings.length) {
  console.log('\nMissing Cargo.toml (no Rust bindings detected):');
  for (const name of missingRustBindings) console.log(`- ${name}`);
}
console.log('\nUpdated grammars.json');
