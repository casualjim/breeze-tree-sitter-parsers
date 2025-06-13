#!/usr/bin/env node

const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

// Configuration
const REPO_OWNER = 'casualjim';
const REPO_NAME = 'breeze-tree-sitter-parsers';
const VERSION = require('./package.json').version;

async function downloadFile(url, destination) {
  const dir = path.dirname(destination);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'breeze-tree-sitter-parsers' } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      pipeline(response, file)
        .then(() => resolve())
        .catch(reject);
    }).on('error', reject);
  });
}

function getPlatformBinaryName() {
  const platform = os.platform();
  const arch = os.arch();
  
  switch (platform) {
    case 'darwin':
      return `libtree-sitter-all-macos-${arch === 'arm64' ? 'aarch64' : 'x86_64'}.a`;
    case 'linux':
      // Try to detect musl
      const isMusl = (() => {
        try {
          const lddOutput = require('child_process').execSync('ldd --version 2>&1', { encoding: 'utf8' });
          return lddOutput.includes('musl');
        } catch {
          return false;
        }
      })();
      
      const archName = arch === 'arm64' ? 'aarch64' : 'x86_64';
      return `libtree-sitter-all-linux-${archName}-${isMusl ? 'musl' : 'glibc'}.a`;
    case 'win32':
      return `libtree-sitter-all-windows-${arch === 'arm64' ? 'aarch64' : 'x86_64'}.a`;
    default:
      throw new Error(`Unsupported platform: ${platform} ${arch}`);
  }
}

function getMetadataFileName() {
  const binaryName = getPlatformBinaryName();
  return binaryName.replace('libtree-sitter-all-', 'grammars-').replace('.a', '.json');
}

async function checkOptionalDependency() {
  try {
    // Try to load the main module which will check for platform packages
    require('./index.js');
    console.log('Platform-specific package already installed.');
    return true;
  } catch (error) {
    console.log('Platform-specific package not found, will download binary.');
    return false;
  }
}

async function downloadBinaries() {
  const binaryName = getPlatformBinaryName();
  const metadataName = getMetadataFileName();
  const binariesDir = path.join(__dirname, 'binaries');
  
  const binaryPath = path.join(binariesDir, binaryName);
  const metadataPath = path.join(binariesDir, metadataName);
  
  // Check if already downloaded
  if (fs.existsSync(binaryPath) && fs.existsSync(metadataPath)) {
    console.log('Binaries already downloaded.');
    return;
  }
  
  console.log(`Downloading tree-sitter parsers for your platform...`);
  
  // Construct download URLs
  const releaseUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${VERSION}`;
  const binaryUrl = `${releaseUrl}/${binaryName}`;
  const metadataUrl = `${releaseUrl}/${metadataName}`;
  
  try {
    // Download both files
    console.log(`Downloading ${binaryName}...`);
    await downloadFile(binaryUrl, binaryPath);
    
    console.log(`Downloading ${metadataName}...`);
    await downloadFile(metadataUrl, metadataPath);
    
    console.log('Download complete!');
  } catch (error) {
    console.error('Failed to download binaries:', error.message);
    console.error('You may need to manually download the binaries from:');
    console.error(`  ${binaryUrl}`);
    console.error(`  ${metadataUrl}`);
    process.exit(1);
  }
}

async function main() {
  // Skip in CI environments or when explicitly disabled
  if (process.env.CI || process.env.BREEZE_SKIP_DOWNLOAD) {
    console.log('Skipping postinstall download.');
    return;
  }
  
  // Check if optional dependency was installed
  const hasOptionalDep = await checkOptionalDependency();
  
  if (!hasOptionalDep) {
    await downloadBinaries();
  }
}

// Only run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Postinstall failed:', error);
    process.exit(1);
  });
}