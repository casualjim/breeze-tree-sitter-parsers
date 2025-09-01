#!/usr/bin/env node
'use strict';

// Strict comparison of local grammars.json against Goldziher upstream schema.
// No fallbacks. Fail fast on schema deviations.
//
// Upstream schema (exact):
//   {
//     "<language>": {
//       "repo": string (required, full GitHub URL),
//       "rev": string (required, git commit SHA),
//       "branch": string (optional),
//       "directory": string (optional, subdirectory containing grammar)
//     },
//     ...
//   }
//
// Local schema (expected):
//   { "grammars": [
//       {
//         "name": string (required, lower-case language key),
//         "repo": string (required, full GitHub URL),
//         "rev": string (required, git commit SHA),
//         "path": string (optional, subdirectory),
//         "branch": string (optional),
//         "symbol_name": string (optional)
//       }, ...
//   ]}
//
// Usage:
//   node scripts/compare-grammars.js
//   node scripts/compare-grammars.js --url https://raw.githubusercontent.com/Goldziher/tree-sitter-language-pack/main/sources/language_definitions.json
//   node scripts/compare-grammars.js --upstream ./language_definitions.json
//   node scripts/compare-grammars.js --local ./grammars.json
//   node scripts/compare-grammars.js --output json --strict
//   node scripts/compare-grammars.js --show-equal

const fs = require('fs');

const DEFAULT_URL = 'https://raw.githubusercontent.com/Goldziher/tree-sitter-language-pack/main/sources/language_definitions.json';

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    upstream: '',
    local: 'grammars.json',
    output: 'text',
    strict: false,
    showEqual: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url' && argv[i + 1]) { args.url = argv[++i]; continue; }
    if (a === '--upstream' && argv[i + 1]) { args.upstream = argv[++i]; continue; }
    if (a === '--local' && argv[i + 1]) { args.local = argv[++i]; continue; }
    if (a === '--output' && argv[i + 1]) { args.output = argv[++i]; continue; }
    if (a === '--strict') { args.strict = true; continue; }
    if (a === '--show-equal') { args.showEqual = true; continue; }
    if (a === '-h' || a === '--help') { printHelpAndExit(0); }
  }
  return args;
}

function printHelpAndExit(code) {
  console.log(`Compare local grammars.json with upstream definitions (STRICT)\n\nUsage:\n  node scripts/compare-grammars.js [--url URL | --upstream FILE] [--local FILE] [--output text|json] [--strict] [--show-equal]\n`);
  process.exit(code);
}

// Strictly parse upstream map object -> array of { name, repo, rev, path }
function parseUpstreamStrict(txt) {
  let obj;
  try {
    obj = JSON.parse(txt);
  } catch (e) {
    throw new Error(`Failed to parse upstream JSON: ${e.message}`);
  }
  if (obj === null || Array.isArray(obj) || typeof obj !== 'object') {
    throw new Error('Upstream must be a JSON object mapping language -> {repo, rev, [branch], [directory]}');
  }

  const allowed = new Set(['repo', 'rev', 'branch', 'directory', 'generate', 'rewrite_targets', 'abi_version']);
  const out = [];
  for (const [name, def] of Object.entries(obj)) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Upstream contains an invalid language key');
    }
    if (def === null || Array.isArray(def) || typeof def !== 'object') {
      throw new Error(`Upstream.${name} must be an object`);
    }
    // Validate keys
    for (const k of Object.keys(def)) {
      if (!allowed.has(k)) {
        throw new Error(`Upstream.${name} has unknown key: ${k}`);
      }
    }
    // Validate required fields
    if (typeof def.repo !== 'string' || !def.repo.startsWith('https://')) {
      throw new Error(`Upstream.${name}.repo must be a full https URL`);
    }
    if (typeof def.rev !== 'string' || def.rev.length < 7) {
      throw new Error(`Upstream.${name}.rev must be a git commit SHA`);
    }
    // Optional fields
    if (def.branch !== undefined && typeof def.branch !== 'string') {
      throw new Error(`Upstream.${name}.branch must be a string when present`);
    }
    if (def.directory !== undefined && typeof def.directory !== 'string') {
      throw new Error(`Upstream.${name}.directory must be a string when present`);
    }
    if (def.generate !== undefined && typeof def.generate !== 'boolean') {
      throw new Error(`Upstream.${name}.generate must be a boolean when present`);
    }
    if (def.rewrite_targets !== undefined && typeof def.rewrite_targets !== 'boolean') {
      throw new Error(`Upstream.${name}.rewrite_targets must be a boolean when present`);
    }
    if (def.abi_version !== undefined && !Number.isInteger(def.abi_version)) {
      throw new Error(`Upstream.${name}.abi_version must be an integer when present`);
    }

    out.push({ name, repo: def.repo, rev: def.rev, path: def.directory || '' });
  }
  return out;
}

function loadLocalStrict(localPath) {
  const txt = fs.readFileSync(localPath, 'utf8');
  let obj;
  try {
    obj = JSON.parse(txt);
  } catch (e) {
    throw new Error(`Failed to parse local JSON (${localPath}): ${e.message}`);
  }
  if (obj === null || Array.isArray(obj) || typeof obj !== 'object') {
    throw new Error(`Local file must be an object containing { grammars: [...] }`);
  }
  const list = obj.grammars;
  if (!Array.isArray(list)) {
    throw new Error(`Local file missing required 'grammars' array`);
  }

  const allowed = new Set(['name', 'repo', 'rev', 'path', 'branch', 'symbol_name']);
  const out = [];
  for (const g of list) {
    if (g === null || Array.isArray(g) || typeof g !== 'object') {
      throw new Error('Local grammars must be objects');
    }
    for (const k of Object.keys(g)) {
      if (!allowed.has(k)) {
        throw new Error(`Local grammar '${g.name ?? '<unknown>'}' has unknown key: ${k}`);
      }
    }
    if (typeof g.name !== 'string' || !g.name) throw new Error('Local grammar missing required string name');
    if (typeof g.repo !== 'string' || !g.repo.startsWith('https://')) throw new Error(`Local.${g.name}.repo must be a full https URL`);
    if (typeof g.rev !== 'string' || g.rev.length < 7) throw new Error(`Local.${g.name}.rev must be a git commit SHA`);
    if (g.path !== undefined && typeof g.path !== 'string') throw new Error(`Local.${g.name}.path must be a string when present`);
    if (g.branch !== undefined && typeof g.branch !== 'string') throw new Error(`Local.${g.name}.branch must be a string when present`);
    if (g.symbol_name !== undefined && typeof g.symbol_name !== 'string') throw new Error(`Local.${g.name}.symbol_name must be a string when present`);

    out.push({ name: g.name, repo: g.repo, rev: g.rev, path: g.path || '' });
  }
  return out;
}

function toMapStrict(list) {
  const m = new Map();
  for (const item of list) {
    m.set(item.name, item);
  }
  return m;
}

function compare(upstreamList, localList) {
  const uMap = toMapStrict(upstreamList);
  const lMap = toMapStrict(localList);

  const diffs = [];
  const equal = [];
  const missingLocal = [];
  const missingUpstream = [];

  for (const [name, u] of uMap) {
    const l = lMap.get(name);
    if (!l) { missingLocal.push(name); continue; }
    const repoDiff = u.repo !== l.repo;
    const revDiff = u.rev !== l.rev;
    const pathDiff = (u.path || '') !== (l.path || '');
    if (repoDiff || revDiff || pathDiff) {
      diffs.push({ name, repoUp: u.repo, repoLocal: l.repo, revUp: u.rev, revLocal: l.rev, pathUp: u.path || '', pathLocal: l.path || '' });
    } else {
      if (l) equal.push({ name });
    }
  }
  for (const [name] of lMap) {
    if (!uMap.has(name)) missingUpstream.push(name);
  }

  diffs.sort((a, b) => a.name.localeCompare(b.name));
  equal.sort((a, b) => a.name.localeCompare(b.name));
  missingLocal.sort();
  missingUpstream.sort();

  return { uCount: uMap.size, lCount: lMap.size, diffs, equal, missingLocal, missingUpstream };
}

function printText(result, showEqual) {
  const { uCount, lCount, diffs, equal, missingLocal, missingUpstream } = result;
  console.log(`Compared languages: ${Math.min(uCount, lCount)} (upstream: ${uCount}, local: ${lCount})`);
  console.log('');
  console.log(`MISMATCHES: ${diffs.length}`);
  for (const d of diffs) {
    const parts = [];
    if (d.repoUp !== d.repoLocal) parts.push(`repo: ${d.repoLocal} -> ${d.repoUp}`);
    if (d.revUp !== d.revLocal) parts.push(`rev: ${short(d.revLocal)} -> ${short(d.revUp)}`);
    if (d.pathUp !== d.pathLocal) parts.push(`path: ${d.pathLocal || '-'} -> ${d.pathUp || '-'}`);
    console.log(`- ${d.name}: ${parts.join('; ')}`);
  }
  if (showEqual) {
    console.log('');
    console.log(`EQUAL (${equal.length}):`);
    for (const e of equal) console.log(`- ${e.name}`);
  }
  console.log('');
  console.log(`MISSING IN LOCAL (${missingLocal.length}):`);
  for (const n of missingLocal) console.log(`- ${n}`);
  console.log('');
  console.log(`MISSING IN UPSTREAM (${missingUpstream.length}):`);
  for (const n of missingUpstream) console.log(`- ${n}`);
}

function short(x) { return x ? String(x).slice(0, 12) : ''; }

(async function main() {
  try {
    const args = parseArgs(process.argv);

    const upstreamList = args.upstream
      ? parseUpstreamStrict(fs.readFileSync(args.upstream, 'utf8'))
      : parseUpstreamStrict(await (await fetch(args.url, { redirect: 'follow' })).text());

    const localList = loadLocalStrict(args.local);
    const result = compare(upstreamList, localList);

    if (args.output === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printText(result, args.showEqual);
    }

    if (args.strict && (result.diffs.length || result.missingLocal.length || result.missingUpstream.length)) {
      process.exit(2);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
})();
