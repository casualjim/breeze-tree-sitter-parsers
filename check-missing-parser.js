#!/usr/bin/env node

const fs = require('fs');
const { spawn } = require('child_process');
const pLimit = require('p-limit');

const grammars = JSON.parse(fs.readFileSync('grammars.json', 'utf8')).grammars;

// Track API failures
let consecutiveApiFailures = 0;
let totalApiCalls = 0;
let failedApiCalls = 0;

// Simple async gh API call with better error tracking
function ghApi(...args) {
  totalApiCalls++;
  return new Promise((resolve) => {
    const child = spawn('gh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.on('close', (code) => {
      if (code === 0) {
        consecutiveApiFailures = 0;
        resolve(output.trim());
      } else {
        failedApiCalls++;
        consecutiveApiFailures++;
        // Return null for API failures, but track them
        resolve(null);
      }
    });
  });
}

// Get the repo's default branch (cached)
const defaultBranchCache = new Map();
async function getDefaultBranch(repoPath) {
  if (defaultBranchCache.has(repoPath)) {
    return defaultBranchCache.get(repoPath);
  }
  const result = await ghApi('api', `repos/${repoPath}`, '--jq', '.default_branch');
  defaultBranchCache.set(repoPath, result);
  return result;
}

// Check if a branch exists
async function branchExists(repoPath, branch) {
  return await ghApi('api', `repos/${repoPath}/branches/${branch}`, '--jq', '.name') !== null;
}

// Check if a file exists on a branch
async function fileExists(repoPath, filePath, branch) {
  return await ghApi('api', `repos/${repoPath}/contents/${filePath}?ref=${branch}`, '--jq', '.name') !== null;
}

async function checkGrammar(grammar) {
  const repoMatch = grammar.repo.match(/github\.com\/([^/]+\/[^/.]+)/);
  if (!repoMatch) {
    return { grammar, nonGithub: true };
  }

  const repoPath = repoMatch[1];
  const specifiedBranch = grammar.branch;
  const filePrefix = grammar.path ? `${grammar.path}/` : '';

  // Get actual default branch
  const defaultBranch = await getDefaultBranch(repoPath);

  // Determine which branch to check
  const branchToCheck = specifiedBranch || defaultBranch;
  if (!branchToCheck) {
    return { grammar, error: 'Cannot determine branch', defaultBranch };
  }

  // Check if specified branch exists (when explicitly set)
  const specifiedExists = specifiedBranch ? await branchExists(repoPath, specifiedBranch) : true;

  // Check files on the branch we're using
  const [hasParserC, hasGrammarJs, hasGrammarJson] = await Promise.all([
    fileExists(repoPath, `${filePrefix}src/parser.c`, branchToCheck),
    fileExists(repoPath, `${filePrefix}grammar.js`, branchToCheck),
    fileExists(repoPath, `${filePrefix}grammar.json`, branchToCheck),
  ]);

  process.stdout.write('.');

  return {
    grammar,
    specifiedBranch,
    defaultBranch,
    branchToCheck,
    specifiedExists,
    hasParserC,
    hasGrammarJs,
    hasGrammarJson,
  };
}

async function main() {
  console.log('Analyzing grammars.json...\n');
  process.stdout.write('Checking: ');

  const limit = pLimit(15);
  const results = await Promise.all(grammars.map(g => {
    const grammar = g;
    return limit(() => checkGrammar(grammar));
  }));

  process.stdout.write('\n\n');

  // Check if we had systematic failures
  if (failedApiCalls > 10) {
    console.error('⚠️  HIGH API FAILURE RATE - results may be incomplete');
    console.error(`API calls: ${totalApiCalls} total, ${failedApiCalls} failed`);
    console.error('This likely means: rate limit, auth failure, or network issue');
    console.log();
  }

  let wrongBranch = 0;
  let needsGeneration = 0;
  let hasParser = 0;
  let missingAll = 0;
  let nonGithub = 0;
  let errors = 0;
  let onNonDefault = 0;

  for (const r of results) {
    if (r.nonGithub) {
      nonGithub++;
      console.log(`NON-GITHUB: ${r.grammar.name}`);
      console.log(`  Repo: ${r.grammar.repo}`);
      console.log(`  Path: ${r.grammar.path || '<root>'}`);
      console.log();
      continue;
    }

    if (r.error) {
      errors++;
      console.log(`ERROR: ${r.grammar.name}`);
      console.log(`  Repo: ${r.grammar.repo}`);
      console.log(`  ${r.error}${r.defaultBranch === null ? ' (API failed)' : ''}`);
      console.log();
      continue;
    }

    const { grammar, specifiedBranch, defaultBranch, branchToCheck, specifiedExists, hasParserC, hasGrammarJs, hasGrammarJson } = r;

    if (specifiedBranch && specifiedBranch !== defaultBranch && (hasParserC || hasGrammarJs || hasGrammarJson)) {
      onNonDefault++;
      console.log(`ON NON-DEFAULT BRANCH: ${grammar.name}`);
      console.log(`  Repo: ${grammar.repo}`);
      console.log(`  Specified: ${specifiedBranch}`);
      console.log(`  Default: ${defaultBranch}`);
      console.log(`  Path: ${grammar.path || '<root>'}`);
      console.log(`  Has: ${hasParserC ? 'parser.c' : ''}${hasGrammarJs ? ' grammar.js' : ''}${hasGrammarJson ? ' grammar.json' : ''}`);
      if (!hasParserC) {
        console.log(`  ⚠️  Needs generation`);
      }
      console.log();
      continue;
    }

    if (specifiedBranch && specifiedBranch !== defaultBranch) {
      wrongBranch++;
      console.log(`WRONG/MISSING BRANCH: ${grammar.name}`);
      console.log(`  Repo: ${grammar.repo}`);
      console.log(`  Specified: ${specifiedBranch} (exists: ${specifiedExists})`);
      console.log(`  Default: ${defaultBranch}`);
      console.log(`  Path: ${grammar.path || '<root>'}`);
      if (!specifiedExists) {
        console.log(`  ⚠️  Specified branch DOES NOT EXIST`);
      } else {
        console.log(`  ⚠️  Branch exists but has no source files`);
      }
      console.log();
      continue;
    }

    if (hasParserC) {
      hasParser++;
    } else if (hasGrammarJs) {
      needsGeneration++;
      console.log(`NEEDS GENERATION: ${grammar.name}`);
      console.log(`  Repo: ${grammar.repo}`);
      console.log(`  Branch: ${branchToCheck}${specifiedBranch ? ' (explicit)' : ' (default)'}`);
      console.log(`  Path: ${grammar.path || '<root>'}`);
      console.log(`  Has: grammar.js${hasGrammarJson ? ', grammar.json' : ''}`);
      console.log();
    } else if (!hasGrammarJson) {
      missingAll++;
      console.log(`MISSING SOURCE FILES: ${grammar.name}`);
      console.log(`  Repo: ${grammar.repo}`);
      console.log(`  Branch: ${branchToCheck}`);
      console.log(`  Path: ${grammar.path || '<root>'}`);
      console.log(`  ⚠️  No grammar.js, parser.c, or grammar.json found`);
      console.log();
    }
  }

  console.log('================================');
  console.log(`Total: ${results.length}`);
  console.log(`Has parser.c (ready): ${hasParser}`);
  console.log(`Needs generation: ${needsGeneration}`);
  console.log(`On non-default branch (intentional): ${onNonDefault}`);
  console.log(`Wrong/missing branch: ${wrongBranch}`);
  console.log(`Missing all source files: ${missingAll}`);
  console.log(`Non-GitHub repos: ${nonGithub}`);
  console.log(`Errors (API failures): ${errors}`);
  if (failedApiCalls > 0) {
    console.log(`\nAPI calls: ${totalApiCalls} total, ${failedApiCalls} failed`);
  }
}

main().catch(console.error);
