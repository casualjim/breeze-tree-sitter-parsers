#!/usr/bin/env node
'use strict';

// Merge Goldziher tree-sitter-language-pack definitions into local grammars.json
// Strict schema, fail-fast, cumulative merge (retain local-only grammars).
//
// Upstream schema (exact per LanguageDict):
//   {
//     "<language>": {
//       repo: string (required, https URL),
//       rev: string (required, commit SHA),
//       branch?: string,
//       directory?: string,
//       generate?: boolean,
//       rewrite_targets?: boolean,
//       abi_version?: integer,
//     }, ...
//   }
//
// Local schema (expected):
//   { grammars: [
//       { name: string, repo: string, rev: string, path?: string, branch?: string, symbol_name?: string }, ...
//   ]}
//
// Usage:
//   node scripts/merge-grammars.js                           # read upstream from default URL, print merged JSON to stdout
//   node scripts/merge-grammars.js --upstream file.json      # use local upstream file
//   node scripts/merge-grammars.js --local grammars.json     # set local file (default: grammars.json)
//   node scripts/merge-grammars.js --write                   # write the merged result back to --local in-place
//
// Notes:
// - For entries present in both upstream and local, we update repo and rev.
// - We set path from upstream.directory when provided; otherwise we keep existing path.
// - We set branch from upstream.branch when provided; otherwise we keep existing branch.
// - We do not delete local-only grammars; we add upstream-only grammars.

const fs = require('fs');

const DEFAULT_URL = 'https://raw.githubusercontent.com/Goldziher/tree-sitter-language-pack/main/sources/language_definitions.json';

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    upstream: '',
    local: 'grammars.json',
    write: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url' && argv[i + 1]) { args.url = argv[++i]; continue; }
    if (a === '--upstream' && argv[i + 1]) { args.upstream = argv[++i]; continue; }
    if (a === '--local' && argv[i + 1]) { args.local = argv[++i]; continue; }
    if (a === '--write') { args.write = true; continue; }
    if (a === '-h' || a === '--help') { printHelpAndExit(0); }
  }
  return args;
}

function printHelpAndExit(code) {
  console.log(`Merge upstream language definitions into local grammars.json (STRICT)\n\nUsage:\n  node scripts/merge-grammars.js [--url URL | --upstream FILE] [--local FILE] [--write]\n`);
  process.exit(code);
}

function parseUpstreamStrict(txt) {
  let obj;
  try { obj = JSON.parse(txt); } catch (e) { throw new Error(`Failed to parse upstream JSON: ${e.message}`); }
  if (obj === null || Array.isArray(obj) || typeof obj !== 'object') {
    throw new Error('Upstream must be a JSON object mapping language -> {repo, rev, [branch], [directory], [generate], [rewrite_targets], [abi_version]}');
  }
  const allowed = new Set(['repo', 'rev', 'branch', 'directory', 'generate', 'rewrite_targets', 'abi_version']);
  const out = [];
  for (const [name, def] of Object.entries(obj)) {
    if (typeof name !== 'string' || name.trim() === '') throw new Error('Upstream contains an invalid language key');
    if (def === null || Array.isArray(def) || typeof def !== 'object') throw new Error(`Upstream.${name} must be an object`);
    for (const k of Object.keys(def)) {
      if (!allowed.has(k)) throw new Error(`Upstream.${name} has unknown key: ${k}`);
    }
    if (typeof def.repo !== 'string' || !def.repo.startsWith('https://')) throw new Error(`Upstream.${name}.repo must be a full https URL`);
    if (typeof def.rev !== 'string' || def.rev.length < 7) throw new Error(`Upstream.${name}.rev must be a git commit SHA`);
    if (def.branch !== undefined && typeof def.branch !== 'string') throw new Error(`Upstream.${name}.branch must be a string when present`);
    if (def.directory !== undefined && typeof def.directory !== 'string') throw new Error(`Upstream.${name}.directory must be a string when present`);
    if (def.generate !== undefined && typeof def.generate !== 'boolean') throw new Error(`Upstream.${name}.generate must be a boolean when present`);
    if (def.rewrite_targets !== undefined && typeof def.rewrite_targets !== 'boolean') throw new Error(`Upstream.${name}.rewrite_targets must be a boolean when present`);
    if (def.abi_version !== undefined && !Number.isInteger(def.abi_version)) throw new Error(`Upstream.${name}.abi_version must be an integer when present`);

    {
      const entry = { name, repo: def.repo, rev: def.rev };
      if (def.directory) entry.path = def.directory;
      if (def.branch) entry.branch = def.branch;
      out.push(entry);
    }
  }
  return out;
}

function loadLocalStrict(localPath) {
  const txt = fs.readFileSync(localPath, 'utf8');
  let obj;
  try { obj = JSON.parse(txt); } catch (e) { throw new Error(`Failed to parse local JSON (${localPath}): ${e.message}`); }
  if (obj === null || Array.isArray(obj) || typeof obj !== 'object') throw new Error(`Local file must be an object containing { grammars: [...] }`);
  const list = obj.grammars;
  if (!Array.isArray(list)) throw new Error(`Local file missing required 'grammars' array`);

  const allowed = new Set(['name', 'repo', 'rev', 'path', 'branch', 'symbol_name']);
  const out = [];
  for (const g of list) {
    if (g === null || Array.isArray(g) || typeof g !== 'object') throw new Error('Local grammars must be objects');
    for (const k of Object.keys(g)) if (!allowed.has(k)) throw new Error(`Local grammar '${g.name ?? '<unknown>'}' has unknown key: ${k}`);
    if (typeof g.name !== 'string' || !g.name) throw new Error('Local grammar missing required string name');
    if (typeof g.repo !== 'string' || !g.repo.startsWith('https://')) throw new Error(`Local.${g.name}.repo must be a full https URL`);
    if (typeof g.rev !== 'string' || g.rev.length < 7) throw new Error(`Local.${g.name}.rev must be a git commit SHA`);
    if (g.path !== undefined && typeof g.path !== 'string') throw new Error(`Local.${g.name}.path must be a string when present`);
    if (g.branch !== undefined && typeof g.branch !== 'string') throw new Error(`Local.${g.name}.branch must be a string when present`);
    if (g.symbol_name !== undefined && typeof g.symbol_name !== 'string') throw new Error(`Local.${g.name}.symbol_name must be a string when present`);

    out.push({ ...g });
  }
  return out;
}

function toMapByName(list) {
  const m = new Map();
  for (const item of list) m.set(item.name, item);
  return m;
}

function cleanEntry(e) {
  const o = { name: e.name, repo: e.repo, rev: e.rev };
  if (typeof e.symbol_name === 'string' && e.symbol_name.length > 0) o.symbol_name = e.symbol_name;
  if (typeof e.path === 'string' && e.path.trim() !== '') o.path = e.path;
  if (typeof e.branch === 'string' && e.branch.trim() !== '') o.branch = e.branch;
  return o;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

(function main(){
  (async () => {
    const args = parseArgs(process.argv);

    const upstreamTxt = args.upstream ? fs.readFileSync(args.upstream, 'utf8') : await fetchText(args.url);
    const upstream = parseUpstreamStrict(upstreamTxt);
    const local = loadLocalStrict(args.local);

    const uMap = toMapByName(upstream);
    const lMap = toMapByName(local);

    let updated = 0, inserted = 0, unchanged = 0;

    // Update existing entries
    for (const [name, l] of lMap) {
      const u = uMap.get(name);
      if (!u) { continue; }
      let changed = false;

      if (l.repo !== u.repo) { l.repo = u.repo; changed = true; }
      if (l.rev !== u.rev) { l.rev = u.rev; changed = true; }
      if (typeof u.path === 'string' && u.path !== '' && l.path !== u.path) { l.path = u.path; changed = true; }
      if (u.branch !== undefined && l.branch !== u.branch) { l.branch = u.branch; changed = true; }

      if (changed) updated++; else unchanged++;
    }

    // Insert upstream-only entries
    for (const [name, u] of uMap) {
      if (lMap.has(name)) continue;
      const entry = { name, repo: u.repo, rev: u.rev };
      if (u.path) entry.path = u.path;
      if (u.branch) entry.branch = u.branch;
      lMap.set(name, entry);
      inserted++;
    }

    // Build merged list sorted by name
    const merged = Array.from(lMap.values())
      .sort((a,b)=> a.name.localeCompare(b.name))
      .map(cleanEntry);
    const mergedObj = { grammars: merged };

    if (args.write) {
      const json = JSON.stringify(mergedObj, null, 2) + '\n';
      fs.writeFileSync(args.local, json, 'utf8');
      console.log(`Updated ${args.local}. updated=${updated} inserted=${inserted} unchanged=${unchanged}`);
    } else {
      process.stdout.write(JSON.stringify(mergedObj, null, 2) + '\n');
      console.error(`Summary: updated=${updated} inserted=${inserted} unchanged=${unchanged}`);
    }
  })().catch(err => { console.error(`ERROR: ${err.message}`); process.exit(1); });
})();
