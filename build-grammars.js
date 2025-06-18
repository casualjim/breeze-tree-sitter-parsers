#!/usr/bin/env node

/**
 * Build tree-sitter grammars for multiple platforms.
 * This tool can fetch grammars and compile them using zig for cross-platform support.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

// Platform configurations
const PLATFORMS = {
  'linux-x86_64-glibc': {
    zig_target: 'x86_64-linux-gnu',
    rust_target: 'x86_64-unknown-linux-gnu',
  },
  'linux-x86_64-musl': {
    zig_target: 'x86_64-linux-musl',
    rust_target: 'x86_64-unknown-linux-musl',
  },
  'linux-aarch64-glibc': {
    zig_target: 'aarch64-linux-gnu',
    rust_target: 'aarch64-unknown-linux-gnu',
  },
  'linux-aarch64-musl': {
    zig_target: 'aarch64-linux-musl',
    rust_target: 'aarch64-unknown-linux-musl',
  },
  'windows-x86_64': {
    zig_target: 'x86_64-windows-msvc',
    rust_target: 'x86_64-pc-windows-msvc',
  },
  'windows-aarch64': {
    zig_target: 'aarch64-windows-msvc',
    rust_target: 'aarch64-pc-windows-msvc',
  },
  'macos-x86_64': {
    zig_target: 'x86_64-macos',
    rust_target: 'x86_64-apple-darwin',
  },
  'macos-aarch64': {
    zig_target: 'aarch64-macos',
    rust_target: 'aarch64-apple-darwin',
  },
};

function getCurrentPlatform() {
  const system = os.platform();
  const machine = os.arch();

  let platformName;
  if (system === 'darwin') {
    platformName = 'macos';
  } else if (system === 'win32') {
    platformName = 'windows';
  } else {
    platformName = system;
  }

  let arch;
  if (machine === 'x64') {
    arch = 'x86_64';
  } else if (machine === 'arm64') {
    arch = 'aarch64';
  } else {
    return null;
  }

  // Check for musl on Linux
  if (platformName === 'linux') {
    try {
      const lddOutput = execSync('ldd --version 2>&1', { encoding: 'utf8' });
      if (lddOutput.includes('musl')) {
        return `${platformName}-${arch}-musl`;
      } else {
        return `${platformName}-${arch}-glibc`;
      }
    } catch {
      return `${platformName}-${arch}-glibc`;
    }
  }

  return `${platformName}-${arch}`;
}

function checkZig() {
  try {
    const result = execSync('zig version', { encoding: 'utf8' });
    console.log(`Found zig: ${result.trim()}`);
    return true;
  } catch {
    throw new Error('Zig not found. Please install zig, it\'s a build dependency for cross-compilation.');
  }
}

async function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(`Command failed: ${cmd} ${args.join(' ')}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });

    child.on('error', reject);

    // Set timeout if specified
    if (options.timeout) {
      setTimeout(() => {
        child.kill();
        reject(new Error(`Command timeout after ${options.timeout}ms`));
      }, options.timeout);
    }
  });
}

async function fetchGrammar(grammar, cacheDir) {
  const name = grammar.name;
  const repo = grammar.repo;
  const grammarDir = path.join(cacheDir, name);

  // Check if directory exists and has content
  if (fs.existsSync(grammarDir)) {
    const gitDir = path.join(grammarDir, '.git');
    if (fs.existsSync(gitDir) && fs.readdirSync(grammarDir).length > 0) {
      return { success: true, message: `${name} - already cached` };
    } else {
      // Directory exists but is empty or corrupted, remove it
      fs.rmSync(grammarDir, { recursive: true, force: true });
      console.log(`  Removing corrupted cache for ${name}`);
    }
  }

  let repoUrl = repo;
  if (!repo.startsWith('http')) {
    repoUrl = `https://github.com/${repo}`;
  }

  console.log(`  Starting fetch: ${name} from ${repoUrl}`);

  try {
    // If we need a specific revision, we can't use --depth 1
    if (grammar.rev) {
      // Clone full repo with timeout
      await runCommand('git', ['clone', repoUrl, grammarDir], { timeout: 300000 }); // 5 minute timeout

      // Checkout specific revision
      try {
        await runCommand('git', ['checkout', grammar.rev], { cwd: grammarDir, timeout: 60000 });
      } catch (error) {
        // Clean up the clone if checkout fails
        fs.rmSync(grammarDir, { recursive: true, force: true });
        return { success: false, message: `${name} - ERROR: Revision ${grammar.rev.substring(0, 8)} not found: ${error.stderr}` };
      }
    } else {
      // Use shallow clone for branch or default
      const args = ['clone', '--depth', '1'];
      
      if (grammar.branch) {
        args.push('-b', grammar.branch);
      }
      
      args.push(repoUrl, grammarDir);
      await runCommand('git', args, { timeout: 300000 }); // 5 minute timeout
    }

    return { success: true, message: `${name} - cloned successfully` };
  } catch (error) {
    // Clean up partial clone
    if (fs.existsSync(grammarDir)) {
      fs.rmSync(grammarDir, { recursive: true, force: true });
    }
    
    if (error.message.includes('timeout')) {
      return { success: false, message: `${name} - ERROR: Clone timeout after 5 minutes` };
    }
    
    return { success: false, message: `${name} - ERROR: ${error.stderr || error.message}` };
  }
}

async function compileGrammar(grammar, cacheDir, platformDir, platformConfig = null, useZig = false) {
  const name = grammar.name;
  const grammarDir = path.join(cacheDir, name);

  // Determine source directory
  let srcDir;
  if (grammar.path) {
    srcDir = path.join(grammarDir, grammar.path, 'src');
  } else {
    srcDir = path.join(grammarDir, 'src');
  }

  if (!fs.existsSync(srcDir)) {
    return { success: false, message: `${name} - no src directory` };
  }

  const parserC = path.join(srcDir, 'parser.c');
  if (!fs.existsSync(parserC)) {
    // Try to generate parser.c from grammar.js
    const grammarJs = path.join(grammarDir, 'grammar.js');
    if (fs.existsSync(grammarJs)) {
      try {
        // Try with npx first
        await runCommand('npx', ['tree-sitter', 'generate'], { cwd: grammarDir });
        if (!fs.existsSync(parserC)) {
          return { success: false, message: `${name} - failed to generate parser.c` };
        }
      } catch {
        // Try without npx
        try {
          await runCommand('tree-sitter', ['generate'], { cwd: grammarDir });
          if (!fs.existsSync(parserC)) {
            return { success: false, message: `${name} - failed to generate parser.c` };
          }
        } catch {
          return { success: false, message: `${name} - no parser.c and can't generate (install tree-sitter-cli)` };
        }
      }
    } else {
      return { success: false, message: `${name} - no parser.c` };
    }
  }

  // Check for scanner files
  const scannerC = path.join(srcDir, 'scanner.c');
  const scannerCc = path.join(srcDir, 'scanner.cc');
  const scannerCpp = path.join(srcDir, 'scanner.cpp');

  const sources = [parserC];
  let isCpp = false;

  if (fs.existsSync(scannerCc)) {
    sources.push(scannerCc);
    isCpp = true;
  } else if (fs.existsSync(scannerCpp)) {
    sources.push(scannerCpp);
    isCpp = true;
  } else if (fs.existsSync(scannerC)) {
    sources.push(scannerC);
  }

  // Output file
  const libName = `libtree-sitter-parsers-${name}.a`;
  const outputFile = path.join(platformDir, libName);

  // Compile object files - use grammar name as prefix to avoid conflicts
  const objFiles = [];
  
  for (const source of sources) {
    // Determine if this specific file is C++
    const sourceIsCpp = path.extname(source) === '.cc' || path.extname(source) === '.cpp';

    // Build command for this specific file
    let cmd;
    if (useZig && platformConfig) {
      cmd = sourceIsCpp ? ['zig', 'c++'] : ['zig', 'cc'];
      cmd.push(
        '-target', platformConfig.zig_target,
        '-O3',
        '-c'
      );
    } else {
      const compiler = sourceIsCpp ? 'c++' : 'cc';
      cmd = [compiler, '-O3', '-c'];
    }

    // Add MSVC headers for Windows targets
    const projectRoot = path.dirname(cacheDir);
    const msvcPath = path.join(projectRoot, 'include', 'msvc');
    const isWindowsTarget = platformConfig && (platformConfig.zig_target.includes('windows-msvc'));
    
    if (isWindowsTarget && fs.existsSync(msvcPath)) {
      cmd.push(
        '-I', path.join(msvcPath, 'crt', 'include'),
        '-I', path.join(msvcPath, 'sdk', 'include', 'ucrt'),
        '-I', path.join(msvcPath, 'sdk', 'include', 'um'),
        '-I', path.join(msvcPath, 'sdk', 'include', 'shared')
      );
    }

    // Common flags
    cmd.push(
      '-I', srcDir,
      '-I', grammarDir,
      '-fPIC',
      '-fno-exceptions',
      '-funroll-loops',
      '-fomit-frame-pointer',
      '-ffast-math',
      '-finline-functions',
      '-ffunction-sections',
      '-fdata-sections',
      '-fvisibility=hidden'
    );

    // Add grammar-specific defines to avoid symbol conflicts
    cmd.push(
      `-Dstring_new=ts_${name}_string_new`,
      `-Dscan_comment=ts_${name}_scan_comment`,
      `-Dserialize=ts_${name}_serialize`,
      `-Ddeserialize=ts_${name}_deserialize`,
      `-Dscan=ts_${name}_scan`
    );

    if (sourceIsCpp) {
      cmd.push('-std=c++14');
    } else {
      // For C files, use gnu11 to support static_assert and GNU extensions
      cmd.push('-std=gnu11');
    }

    const objFile = path.join(platformDir, `${name}_${path.basename(source, path.extname(source))}.o`);
    const compileCmd = cmd.concat([source, '-o', objFile]);

    try {
      await runCommand(compileCmd[0], compileCmd.slice(1));
      objFiles.push(objFile);
    } catch (error) {
      // Clean up any object files
      for (const obj of objFiles) {
        try { fs.unlinkSync(obj); } catch {}
      }
      const errorDetails = error.stderr || error.stdout || error.message || 'Unknown error';
      const fullCommand = compileCmd.join(' ');
      return { success: false, message: `${name} - compile error:\nCommand: ${fullCommand}\nError: ${errorDetails}` };
    }
  }

  // Create static library using zig ar
  const arCmd = ['zig', 'ar', 'rcs', outputFile].concat(objFiles);

  try {
    await runCommand(arCmd[0], arCmd.slice(1));

    // Clean up object files
    for (const obj of objFiles) {
      fs.unlinkSync(obj);
    }

    // Note if this grammar uses C++ (for build.rs metadata)
    if (isCpp) {
      fs.writeFileSync(path.join(platformDir, `${name}.cpp`), '');
    }

    return { success: true, message: `${name} - compiled successfully` };
  } catch (error) {
    // Clean up
    for (const obj of objFiles) {
      try { fs.unlinkSync(obj); } catch {}
    }
    try { fs.unlinkSync(outputFile); } catch {}
    const errorDetails = error.stderr || error.stdout || error.message || 'Unknown error';
    const fullCommand = arCmd.join(' ');
    return { success: false, message: `${name} - ar error:\nCommand: ${fullCommand}\nError: ${errorDetails}` };
  }
}

function generateMetadata(compiledGrammars, grammarsConfig, platformDir) {
  const metadataFile = path.join(platformDir, 'grammars.json');
  // Save full grammar objects for compiled grammars
  const compiledGrammarObjects = grammarsConfig.filter(g => compiledGrammars.includes(g.name));
  fs.writeFileSync(
    metadataFile,
    JSON.stringify(compiledGrammarObjects.sort((a, b) => a.name.localeCompare(b.name)), null, 2)
  );
}

// Parallel processing utilities
async function runInParallel(items, workerFn, maxWorkers) {
  const results = [];
  const queue = [...items];
  const workers = [];

  for (let i = 0; i < Math.min(maxWorkers, items.length); i++) {
    workers.push(processQueue());
  }

  async function processQueue() {
    while (queue.length > 0) {
      const item = queue.shift();
      const result = await workerFn(item);
      results.push(result);
      
      // Progress reporting
      const completed = results.length;
      const total = items.length;
      console.log(`  [${completed}/${total}] ${result.message}`);
      
      if (!result.success) {
        throw new Error(result.message);
      }
    }
  }

  await Promise.all(workers);
  return results;
}

// Command-line argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    fetchOnly: false,
    compileOnly: false,
    platform: null,
    allPlatforms: false,
    jobs: os.cpus().length
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--fetch-only':
        options.fetchOnly = true;
        break;
      case '--compile-only':
        options.compileOnly = true;
        break;
      case '--platform':
        options.platform = args[++i];
        break;
      case '--all-platforms':
        options.allPlatforms = true;
        break;
      case '-j':
      case '--jobs':
        options.jobs = parseInt(args[++i]);
        break;
      case '-h':
      case '--help':
        console.log(`Usage: ${path.basename(process.argv[1])} [options]

Options:
  --fetch-only        Only fetch grammars, do not compile
  --compile-only      Only compile, assume grammars are fetched
  --platform PLATFORM Target platform (default: current platform)
  --all-platforms     Build for all platforms (requires zig)
  -j, --jobs N        Number of parallel jobs (default: CPU count)
  -h, --help          Show this help message`);
        process.exit(0);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  // Find project root
  const projectRoot = __dirname;
  const grammarsJson = path.join(projectRoot, 'grammars.json');
  const cacheDir = path.join(projectRoot, 'grammars');
  const precompiledDir = path.join(projectRoot, 'dist');

  if (!fs.existsSync(grammarsJson)) {
    console.error(`Error: ${grammarsJson} not found`);
    process.exit(1);
  }

  // Load grammars configuration
  const config = JSON.parse(fs.readFileSync(grammarsJson, 'utf8'));
  const grammars = config.grammars;
  console.log(`Found ${grammars.length} grammars`);

  // Fetch grammars if needed
  if (!options.compileOnly) {
    console.log('\n=== Fetching grammars ===');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Check which grammars need fetching
    const needFetch = [];
    for (const grammar of grammars) {
      const grammarDir = path.join(cacheDir, grammar.name);
      if (!fs.existsSync(grammarDir) || !fs.existsSync(path.join(grammarDir, '.git'))) {
        needFetch.push(grammar.name);
      }
    }

    if (needFetch.length > 0) {
      console.log(`  Need to fetch: ${needFetch.join(', ')}`);
    }

    console.log(`  Processing ${grammars.length} grammars with ${options.jobs} parallel jobs...`);

    try {
      await runInParallel(grammars, (grammar) => fetchGrammar(grammar, cacheDir), options.jobs);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  if (options.fetchOnly) {
    console.log('\nFetch complete!');
    return;
  }

  // Determine platforms to build
  const useZig = checkZig();

  let platformsToBuild;
  if (options.allPlatforms) {
    if (!useZig) {
      console.error('Error: --all-platforms requires zig to be installed');
      console.error('Install zig from: https://ziglang.org/download/');
      process.exit(1);
    }
    platformsToBuild = Object.keys(PLATFORMS);
  } else if (options.platform) {
    if (!PLATFORMS[options.platform]) {
      console.error(`Error: Unknown platform ${options.platform}`);
      console.error(`Available platforms: ${Object.keys(PLATFORMS).join(', ')}`);
      process.exit(1);
    }
    platformsToBuild = [options.platform];
  } else {
    const current = getCurrentPlatform();
    if (current && PLATFORMS[current]) {
      platformsToBuild = [current];
    } else {
      console.log('Warning: Could not detect current platform or it\'s not in the supported list');
      console.log('Building for generic host platform');
      platformsToBuild = ['host'];
    }
  }

  // Compile for each platform
  for (const platformName of platformsToBuild) {
    console.log(`\n=== Building for ${platformName} ===`);

    const platformDir = path.join(precompiledDir, platformName);
    if (!fs.existsSync(platformDir)) {
      fs.mkdirSync(platformDir, { recursive: true });
    }

    const platformConfig = PLATFORMS[platformName];
    const useZigForPlatform = useZig && platformConfig && platformName !== getCurrentPlatform();

    const compiledGrammars = [];
    const failedGrammars = [];

    console.log(`  Compiling ${grammars.length} grammars with ${options.jobs} parallel jobs...`);

    const results = await runInParallel(
      grammars,
      (grammar) => compileGrammar(grammar, cacheDir, platformDir, platformConfig, useZigForPlatform),
      options.jobs
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].success) {
        compiledGrammars.push(grammars[i].name);
      } else {
        failedGrammars.push(grammars[i].name);
      }
    }

    // Generate metadata
    generateMetadata(compiledGrammars, grammars, platformDir);

    // Combine all static libraries into a single archive
    if (compiledGrammars.length > 0) {
      console.log(`\n  Combining ${compiledGrammars.length} libraries into single archive...`);

      // Collect all library files
      const libFiles = [];
      for (const grammarName of compiledGrammars) {
        const libFile = path.join(platformDir, `libtree-sitter-parsers-${grammarName}.a`);
        if (fs.existsSync(libFile)) {
          libFiles.push(libFile);
        }
      }

      if (libFiles.length > 0) {
        // Create combined library name
        const combinedLib = path.join(precompiledDir, `libtree-sitter-parsers-all-${platformName}.a`);

        // First, extract all object files from all archives
        const tempObjDir = path.join(platformDir, 'temp_objects');
        if (!fs.existsSync(tempObjDir)) {
          fs.mkdirSync(tempObjDir, { recursive: true });
        }

        for (let i = 0; i < libFiles.length; i++) {
          // Extract to a unique subdirectory to avoid name conflicts
          const extractDir = path.join(tempObjDir, `lib_${i}`);
          if (!fs.existsSync(extractDir)) {
            fs.mkdirSync(extractDir, { recursive: true });
          }

          // Extract objects using zig ar
          await runCommand('zig', ['ar', 'x', libFiles[i]], { cwd: extractDir });
        }

        // Collect all object files
        const allObjects = [];
        const dirs = fs.readdirSync(tempObjDir);
        for (const dir of dirs) {
          const objDir = path.join(tempObjDir, dir);
          if (fs.statSync(objDir).isDirectory()) {
            const objects = fs.readdirSync(objDir)
              .filter(f => f.endsWith('.o'))
              .map(f => path.join(objDir, f));
            allObjects.push(...objects);
          }
        }

        // Create the combined archive using zig ar
        const arCmd = ['zig', 'ar', 'rcs', combinedLib].concat(allObjects);

        try {
          await runCommand(arCmd[0], arCmd.slice(1));
          console.log(`  Created combined archive: ${path.basename(combinedLib)}`);

          // Clean up temporary files
          fs.rmSync(tempObjDir, { recursive: true, force: true });

          // Remove individual library files
          for (const libFile of libFiles) {
            fs.unlinkSync(libFile);
          }

          // Move metadata file to precompiled directory with platform suffix
          const metadataSrc = path.join(platformDir, 'grammars.json');
          const metadataDst = path.join(precompiledDir, `grammars-${platformName}.json`);
          if (fs.existsSync(metadataSrc)) {
            fs.renameSync(metadataSrc, metadataDst);
          }

          // Remove the now-empty platform directory
          fs.rmSync(platformDir, { recursive: true, force: true });

        } catch (error) {
          console.error(`  ERROR: Failed to create combined archive: ${error.stderr}`);
          fs.rmSync(tempObjDir, { recursive: true, force: true });
        }
      }
    }

    console.log(`\nPlatform ${platformName} summary:`);
    console.log(`  Compiled: ${compiledGrammars.length} grammars`);
    if (failedGrammars.length > 0) {
      console.log(`  Failed: ${failedGrammars.length} grammars`);
      console.log(`    ${failedGrammars.join(', ')}`);
    }
    if (compiledGrammars.length > 0) {
      console.log(`  Output: ${precompiledDir}/libtree-sitter-parsers-all-${platformName}.a`);
    }
  }

  console.log('\nBuild complete!');
  console.log('\nTo use the precompiled grammars:');
  console.log('1. Make sure your Cargo.toml uses: build = "build.rs"');
  console.log('2. The build.rs will automatically detect and use the precompiled binaries');
}

// Run the main function
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});