#!/usr/bin/env bun -b

/**
 * Update grammar revisions from GitHub.
 * Checks for new commits and updates grammars.json.
 */

import { $ } from "bun";

const grammarsFile = "grammars.json";
const grammars = JSON.parse(await Bun.file(grammarsFile).text()).grammars;

const updates: Array<{ name: string; old: string; new: string }> = [];
const errors: Array<{ name: string; error: string }> = [];
let checkedCount = 0;

// Process a single grammar using gh CLI
async function processGrammar(grammar: any) {
  try {
    const url = new URL(grammar.repo);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      errors.push({ name: grammar.name, error: "Invalid repo URL" });
      return;
    }
    const [owner, repo] = pathParts;

    // Strip .git suffix if present
    const cleanRepo = repo.replace(/\.git$/, '');

    let latestSha: string;

    if (url.hostname === 'gitlab.com') {
      // GitLab API - fetch directly
      const apiUrl = `https://gitlab.com/api/v4/projects/${owner}%2F${cleanRepo}/repository/commits?per_page=1`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        errors.push({ name: grammar.name, error: `GitLab: HTTP ${response.status}` });
        return;
      }
      const commits = await response.json();
      if (!Array.isArray(commits) || commits.length === 0) {
        errors.push({ name: grammar.name, error: "GitLab: No commits" });
        return;
      }
      latestSha = commits[0].id;
    } else {
      // GitHub - use gh CLI
      const proc = await $`gh api repos/${owner}/${cleanRepo}/commits --jq '.[0].sha'`.quiet();
      if ((proc).exitCode !== 0) {
        errors.push({ name: grammar.name, error: "Failed to fetch" });
        return;
      }
      latestSha = proc.stdout.toString().trim();
    }

    if (latestSha && latestSha !== grammar.rev) {
      updates.push({ name: grammar.name, old: grammar.rev, new: latestSha });
      grammar.rev = latestSha;
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    errors.push({ name: grammar.name, error });
  }

  // Progress
  checkedCount++;
  process.stdout.write(`\r  [${checkedCount}/${grammars.length}] Checked ${grammar.name}\x1b[0K`);
}

// Process in parallel (similar to build-grammars.js)
async function processInParallel(items: any[], workerFn: any, maxWorkers: number) {
  const queue = [...items];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < Math.min(maxWorkers, items.length); i++) {
    workers.push(processQueue());
  }

  async function processQueue() {
    while (queue.length > 0) {
      const item = queue.shift();
      await workerFn(item);
    }
  }

  await Promise.all(workers);
}

async function main() {
  console.log(`Checking ${grammars.length} grammars for updates...`);

  await processInParallel(grammars, processGrammar, 10);

  console.log('\n\n=== Grammar Updates ===');

  if (updates.length === 0) {
    console.log('✓ All grammars are up to date!');
  } else {
    console.log(`Found ${updates.length} update(s):\n`);
    for (const update of updates) {
      console.log(`  ${update.name}: ${update.old.substring(0, 7)} → ${update.new.substring(0, 7)}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n⚠ ${errors.length} error(s):\n`);
    for (const error of errors) {
      console.log(`  ${error.name}: ${error.error}`);
    }
  }

  // Always write grammars.latest.json with latest revisions
  const outputFile = "grammars.latest.json";
  await Bun.write(
    outputFile,
    JSON.stringify({ grammars }, null, 2) + "\n",
  );
  console.log(`\n✓ Wrote ${grammars.length} grammars to ${outputFile}`);

  if (updates.length > 0) {
    console.log(`  ${updates.length} grammars have updates - run to apply:`);
    console.log(`  mv ${outputFile} ${grammarsFile}`);
  } else {
    console.log(`  All grammars are at their latest revisions`);
  }
}

main().catch((error) => {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
});
