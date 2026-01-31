#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function existsFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function existsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDirNames(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function parseArgs(argv) {
  const opts = {
    onlyNeedsGeneration: false,
    onlyMissing: false,
    quiet: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--needs-generation":
        opts.onlyNeedsGeneration = true;
        break;
      case "--missing":
        opts.onlyMissing = true;
        break;
      case "--quiet":
        opts.quiet = true;
        break;
      case "-h":
      case "--help":
        console.log(`Usage:
  node scripts/grammars-needs-generation.js [options]

Options:
  --needs-generation   List grammars missing src/parser.c but having grammar.js
  --missing            List grammars missing checkout at grammars/<name>/<rev>
  --quiet              Only print names (no summary)
  -h, --help           Show help
`);
        process.exit(0);
      default:
        // ignore unknown flags
        break;
    }
  }

  return opts;
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

  const missingCheckout = [];
  const needsGeneration = [];
  const brokenNoGrammarJs = [];
  const incompleteCheckout = [];
  const ok = [];

  for (const grammar of list) {
    const { repoDir, baseDir } = grammarBaseDir(grammarsDir, grammar);

    if (!existsDir(repoDir)) {
      missingCheckout.push(grammar.name);
      continue;
    }

    const srcDir = path.join(baseDir, "src");
    const parserC = path.join(srcDir, "parser.c");
    const grammarJs = path.join(baseDir, "grammar.js");

    const hasParserC = existsFile(parserC);
    if (hasParserC) {
      ok.push(grammar.name);
      continue;
    }

    if (existsFile(grammarJs)) {
      needsGeneration.push(grammar.name);
      continue;
    }

    const repoEntries = listDirNames(repoDir);
    const hasOnlyGitDir =
      repoEntries.length > 0 &&
      repoEntries.every((name) => name === ".git" || name === "." || name === "..");

    if (hasOnlyGitDir) {
      incompleteCheckout.push(grammar.name);
    } else {
      brokenNoGrammarJs.push(grammar.name);
    }
  }

  const printed = [];

  function maybePrint(title, names) {
    if (!names.length) return;
    if (opts.quiet) {
      for (const name of names) printed.push(name);
      return;
    }
    console.log(`\n${title} (${names.length})`);
    for (const name of names) console.log(`- ${name}`);
  }

  if (opts.onlyNeedsGeneration) {
    maybePrint("Needs generation", needsGeneration);
  } else if (opts.onlyMissing) {
    maybePrint("Missing checkout", missingCheckout);
  } else {
    if (!opts.quiet) {
      console.log(`Grammars: ${list.length}`);
      console.log(`OK (has src/parser.c): ${ok.length}`);
      console.log(`Needs generation (has grammar.js): ${needsGeneration.length}`);
      console.log(`Incomplete checkout (only .git): ${incompleteCheckout.length}`);
      console.log(`Broken (no src/parser.c and no grammar.js): ${brokenNoGrammarJs.length}`);
      console.log(`Missing checkout (no grammars/<name>/<rev>): ${missingCheckout.length}`);
    }

    maybePrint("Needs generation", needsGeneration);
    maybePrint("Incomplete checkout (only .git)", incompleteCheckout);
    maybePrint("Broken (no grammar.js)", brokenNoGrammarJs);
    maybePrint("Missing checkout", missingCheckout);
  }

  if (opts.quiet && printed.length) {
    process.stdout.write(printed.join("\n") + "\n");
  }
}

main();
