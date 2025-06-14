#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

function printUsage() {
  console.error('Usage: tree-sitter-parsers-path [options]');
  console.error('');
  console.error('Options:');
  console.error('  --os <os>          Target OS (darwin, linux, win32)');
  console.error('  --arch <arch>      Target architecture (x64, arm64)');
  console.error('  --variant <variant> Target variant (glibc, musl) - Linux only');
  console.error('  --metadata         Return metadata file path instead of binary');
  console.error('  --help             Show this help message');
  console.error('');
  console.error('Examples:');
  console.error('  # Get current platform binary');
  console.error('  tree-sitter-parsers-path');
  console.error('');
  console.error('  # Get Linux x64 musl binary path');
  console.error('  tree-sitter-parsers-path --os linux --arch x64 --variant musl');
  console.error('');
  console.error('  # Get macOS ARM64 metadata');
  console.error('  tree-sitter-parsers-path --os darwin --arch arm64 --metadata');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    os: null,
    arch: null,
    variant: null,
    metadata: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--os':
        options.os = args[++i];
        break;
      case '--arch':
        options.arch = args[++i];
        break;
      case '--variant':
        options.variant = args[++i];
        break;
      case '--metadata':
        options.metadata = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function getBinaryName(os, arch, variant) {
  // Map Node.js platform names to our binary naming convention
  const osMap = {
    'darwin': 'macos',
    'linux': 'linux',
    'win32': 'windows'
  };

  const archMap = {
    'x64': 'x86_64',
    'arm64': 'aarch64'
  };

  const mappedOs = osMap[os];
  const mappedArch = archMap[arch];

  if (!mappedOs || !mappedArch) {
    throw new Error(`Unsupported platform: ${os} ${arch}`);
  }

  let binaryName = `libtree-sitter-parsers-all-${mappedOs}-${mappedArch}`;

  // Add variant for Linux
  if (os === 'linux' && variant) {
    binaryName += `-${variant}`;
  } else if (os === 'linux' && !variant) {
    // Default to glibc for Linux if no variant specified
    binaryName += '-glibc';
  }

  return binaryName + '.a';
}

function getMetadataName(binaryName) {
  return binaryName.replace('libtree-sitter-parsers-all-', 'grammars-').replace('.a', '.json');
}

function main() {
  const options = parseArgs();

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  try {
    // If no platform specified, use current platform
    if (!options.os && !options.arch) {
      const { binaryPath, metadataPath } = require('../index.js');
      console.log(options.metadata ? metadataPath : binaryPath);
      process.exit(0);
    }

    // Validate required options for specific platform query
    if ((options.os && !options.arch) || (!options.os && options.arch)) {
      console.error('Error: Both --os and --arch must be specified together');
      printUsage();
      process.exit(1);
    }

    // Get the binary name for the specified platform
    const binaryName = getBinaryName(options.os, options.arch, options.variant);
    const fileName = options.metadata ? getMetadataName(binaryName) : binaryName;

    // Check in dist directory
    const distPath = path.join(__dirname, '..', 'dist', fileName);
    
    if (fs.existsSync(distPath)) {
      console.log(distPath);
      process.exit(0);
    }

    // If not in dist, check if it would be in a platform package
    const packageName = `@kumos/tree-sitter-parsers-${options.os}-${options.arch}${options.variant ? '-' + options.variant : ''}`;
    console.error(`Error: ${fileName} not found locally.`);
    console.error(`It may be available in the ${packageName} package.`);
    process.exit(1);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();