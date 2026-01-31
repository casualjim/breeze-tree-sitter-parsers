#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const HIGHLIGHTS_OVERRIDES = {
  wat: {
    highlights_scm_path: "queries/wat/highlights.scm",
    highlights_scm_repo: "https://github.com/rush-rs/tree-sitter-wasm-queries",
    highlights_scm_ref: "main",
  },
};

const HIGHLIGHTS_EXCLUDE = new Set([
  "scss",
  "brightscript",
  "hurl",
  "latex",
  "sproto",
  "supercollider",
  "cuda",
  "cpp",
  "vhdl",
  "org",
  "netlinx"
  // "lua",
  // "sql",
  // "gleam"
]);

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

function toPosix(p) {
  return p.split(path.sep).join("/");
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

function parseArgs(argv) {
  const opts = {
    write: false,
    output: null,
    prefer: ["neovim", "nvim", "helix", "emacs"],
    quiet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--write":
        opts.write = true;
        break;
      case "--output":
        opts.output = argv[++i] || null;
        break;
      case "--prefer": {
        const raw = argv[++i] || "";
        opts.prefer = raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      }
      case "--quiet":
        opts.quiet = true;
        break;
      case "-h":
      case "--help":
        console.log(`Usage:
  node scripts/grammars-annotate-highlights.js [options]

Annotates grammars.json with \`highlights_scm_path\` per grammar (relative to the grammar base dir).

Selection order:
  1) queries/highlights.scm (generic)
  2) queries/<grammar_name>/highlights.scm (grammar-specific)
  3) if exactly one highlights.scm exists anywhere under queries/, use it
  4) prefer queries/<editor>/highlights.scm based on --prefer list (default: neovim,nvim,helix,emacs)

Options:
  --write                  Write back to grammars.json
  --output FILE            Write annotated JSON to FILE instead
  --prefer a,b,c           Preferred editor subdirs (default: neovim,nvim,helix,emacs)
  --quiet                  Only print summary counts
  -h, --help               Show help
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

function findHighlightsFiles(baseDir) {
  const queriesDir = path.join(baseDir, "queries");
  if (!isDir(queriesDir)) return [];

  const hits = [];
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
        hits.push(abs);
      }
    }
  }

  return hits;
}

function pickHighlightsPath({ grammarName, baseDir, hitsAbs, prefer }) {
  if (!hitsAbs.length) return { picked: null, reason: "no_highlights" };

  const queriesDir = path.join(baseDir, "queries");

  const root = path.join(queriesDir, "highlights.scm");
  if (hitsAbs.includes(root)) {
    return { picked: "queries/highlights.scm", reason: "generic" };
  }

  const byName = path.join(queriesDir, grammarName, "highlights.scm");
  if (hitsAbs.includes(byName)) {
    return { picked: toPosix(path.relative(baseDir, byName)), reason: "grammar_specific" };
  }

  if (hitsAbs.length === 1) {
    return { picked: toPosix(path.relative(baseDir, hitsAbs[0])), reason: "only_one" };
  }

  for (const editor of prefer) {
    const p = path.join(queriesDir, editor, "highlights.scm");
    if (hitsAbs.includes(p)) {
      return { picked: toPosix(path.relative(baseDir, p)), reason: `prefer:${editor}` };
    }
  }

  return {
    picked: toPosix(path.relative(baseDir, hitsAbs[0])),
    reason: "fallback_first",
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const projectRoot = path.join(__dirname, "..");
  const grammarsJsonPath = path.join(projectRoot, "grammars.json");
  const grammarsDir = path.join(projectRoot, "grammars");

  const raw = JSON.parse(fs.readFileSync(grammarsJsonPath, "utf8"));
  const grammars = raw.grammars;

  let withAnyHighlights = 0;
  let annotated = 0;
  let annotatedFromOverride = 0;
  let missingCheckout = 0;
  const ambiguous = [];
  const reasons = new Map();

  for (const grammar of grammars) {
    if (HIGHLIGHTS_EXCLUDE.has(grammar.name)) {
      delete grammar.highlights_scm_path;
      delete grammar.highlights_scm_repo;
      delete grammar.highlights_scm_ref;
      reasons.set("excluded", (reasons.get("excluded") || 0) + 1);
      continue;
    }

    const override = HIGHLIGHTS_OVERRIDES[grammar.name];
    if (override) {
      grammar.highlights_scm_path = override.highlights_scm_path;
      grammar.highlights_scm_repo = override.highlights_scm_repo;
      grammar.highlights_scm_ref = override.highlights_scm_ref;
      annotated++;
      annotatedFromOverride++;
      reasons.set("override", (reasons.get("override") || 0) + 1);
      continue;
    }

    const { repoDir, baseDir } = grammarBaseDir(grammarsDir, grammar);
    if (!isDir(repoDir) || !isDir(baseDir)) {
      missingCheckout++;
      delete grammar.highlights_scm_path;
      delete grammar.highlights_scm_repo;
      delete grammar.highlights_scm_ref;
      continue;
    }

    const hitsAbs = findHighlightsFiles(baseDir);
    if (!hitsAbs.length) {
      delete grammar.highlights_scm_path;
      delete grammar.highlights_scm_repo;
      delete grammar.highlights_scm_ref;
      continue;
    }

    withAnyHighlights++;

    const result = pickHighlightsPath({
      grammarName: grammar.name,
      baseDir,
      hitsAbs,
      prefer: opts.prefer,
    });

    if (!result.picked) {
      delete grammar.highlights_scm_path;
      delete grammar.highlights_scm_repo;
      delete grammar.highlights_scm_ref;
      continue;
    }

    grammar.highlights_scm_path = result.picked;
    delete grammar.highlights_scm_repo;
    delete grammar.highlights_scm_ref;
    annotated++;

    reasons.set(result.reason, (reasons.get(result.reason) || 0) + 1);

    if (hitsAbs.length > 1) {
      ambiguous.push({
        name: grammar.name,
        picked: result.picked,
        reason: result.reason,
        candidates: hitsAbs.map((p) => toPosix(path.relative(baseDir, p))).sort(),
      });
    }
  }

  const outputObj = { ...raw, grammars };
  const outputText = JSON.stringify(outputObj, null, 2) + "\n";

  if (opts.output) {
    fs.writeFileSync(opts.output, outputText);
  } else if (opts.write) {
    fs.writeFileSync(grammarsJsonPath, outputText);
  }

  const reasonsObj = Object.fromEntries([...reasons.entries()].sort((a, b) => a[0].localeCompare(b[0])));

  if (!opts.quiet) {
    console.log(`Grammars: ${grammars.length}`);
    console.log(`Missing checkout: ${missingCheckout}`);
    console.log(`With any highlights: ${withAnyHighlights}`);
    console.log(`Annotated (highlights_scm_path set): ${annotated}`);
    console.log(`Annotated via override: ${annotatedFromOverride}`);
    console.log(`Multi-candidate grammars: ${ambiguous.length}`);
    console.log(`Reasons: ${JSON.stringify(reasonsObj)}`);

    if (ambiguous.length) {
      console.log(`\nMulti-candidate details (for review):`);
      for (const item of ambiguous.sort((a, b) => a.name.localeCompare(b.name))) {
        console.log(`- ${item.name}: ${item.picked} (${item.reason})`);
      }
    }
  } else {
    console.log(
      JSON.stringify(
        {
          total: grammars.length,
          missing_checkout: missingCheckout,
          with_any_highlights: withAnyHighlights,
          annotated,
          annotated_via_override: annotatedFromOverride,
          multi_candidate: ambiguous.length,
          reasons: reasonsObj,
        },
        null,
        2,
      ),
    );
  }
}

main();
