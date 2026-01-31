#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const opts = {
    quiet: false,
    list: false,
    showPaths: false,
    json: false,
    recursive: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--quiet":
        opts.quiet = true;
        break;
      case "--list":
        opts.list = true;
        break;
      case "--paths":
        opts.showPaths = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--recursive":
        opts.recursive = true;
        break;
      case "-h":
      case "--help":
        console.log(`Usage:
  node scripts/grammars-list-highlights.js [options]

Options:
  --list         Print grammar names that have queries/highlights.scm
  --paths        Also print matched file paths per grammar
  --json         Output JSON summary
  --quiet        Names only (implies --list, no counts)
  --recursive    Also match queries/**/highlights.scm
  -h, --help    Show help
`);
        process.exit(0);
      default:
        // ignore unknown flags
        break;
    }
  }

  if (opts.quiet) opts.list = true;

  return opts;
}

function shouldSkipDir(name) {
  return (
    name === ".git" ||
    name === "node_modules" ||
    name === "target" ||
    name === "dist" ||
    name === ".cache"
  );
}

function findHighlightsFiles(baseDir, recursive) {
  const hits = [];
  const queriesDir = path.join(baseDir, "queries");
  if (!isDir(queriesDir)) return hits;

  const rootHighlights = path.join(queriesDir, "highlights.scm");
  if (isFile(rootHighlights)) hits.push(rootHighlights);

  if (!recursive) return hits;

  const queue = [queriesDir];
  while (queue.length) {
    const dir = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) queue.push(abs);
        continue;
      }
      if (entry.isFile() && entry.name === "highlights.scm" && isFile(abs)) {
        if (abs !== rootHighlights) hits.push(abs);
      }
    }
  }

  return hits;
}

function grammarBaseDir(grammarsDir, grammar) {
  if (!grammar.rev) throw new Error(`Missing rev for grammar ${grammar.name}`);
  const repoDir = path.join(grammarsDir, grammar.name, grammar.rev);
  const baseDir = grammar.path ? path.join(repoDir, grammar.path) : repoDir;
  return { repoDir, baseDir };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const projectRoot = path.join(__dirname, "..");
  const grammarsJson = path.join(projectRoot, "grammars.json");
  const grammarsDir = path.join(projectRoot, "grammars");

  const list = JSON.parse(fs.readFileSync(grammarsJson, "utf8")).grammars;

  const withHighlights = [];
  const missingCheckout = [];

  for (const grammar of list) {
    const { repoDir, baseDir } = grammarBaseDir(grammarsDir, grammar);

    if (!isDir(repoDir) || !isDir(baseDir)) {
      missingCheckout.push(grammar.name);
      continue;
    }

    const hits = findHighlightsFiles(baseDir, opts.recursive);
    if (hits.length) {
      withHighlights.push({
        name: grammar.name,
        count: hits.length,
        paths: hits.map((p) => path.relative(projectRoot, p)),
      });
    }
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          total: list.length,
          with_highlights: withHighlights.length,
          missing_checkout: missingCheckout.length,
          grammars: withHighlights,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (!opts.quiet && !opts.list) {
    console.log(`Grammars: ${list.length}`);
    console.log(`With highlights.scm: ${withHighlights.length}`);
    console.log(`Missing checkout: ${missingCheckout.length}`);
  }

  if (opts.list) {
    for (const g of withHighlights) {
      if (opts.quiet) {
        console.log(g.name);
        continue;
      }
      if (opts.showPaths) {
        console.log(`${g.name} (${g.count})`);
        for (const p of g.paths) console.log(`  - ${p}`);
      } else {
        console.log(`${g.name} (${g.count})`);
      }
    }
  }
}

main();
