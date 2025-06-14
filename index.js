const os = require('os');
const path = require('path');
const fs = require('fs');

function getPlatformPackage() {
  const platform = os.platform();
  const arch = os.arch();
  
  let platformPackage;
  
  switch (platform) {
    case 'darwin':
      platformPackage = `@kumos/tree-sitter-parsers-darwin-${arch === 'arm64' ? 'arm64' : 'x64'}`;
      break;
    case 'linux':
      // Check if using musl libc (Alpine Linux, etc.)
      const isMusl = (() => {
        try {
          // First try ldd
          const lddOutput = require('child_process').execSync('ldd --version 2>&1', { encoding: 'utf8' });
          if (lddOutput.includes('musl')) return true;
        } catch {
          // ldd might not exist or fail
        }
        
        // Check if /lib/ld-musl* exists (Alpine/musl systems)
        try {
          const files = fs.readdirSync('/lib');
          return files.some(f => f.startsWith('ld-musl'));
        } catch {
          return false;
        }
      })();
      
      const archSuffix = arch === 'arm64' ? 'arm64' : 'x64';
      platformPackage = `@kumos/tree-sitter-parsers-linux-${archSuffix}${isMusl ? '-musl' : ''}`;
      break;
    case 'win32':
      platformPackage = `@kumos/tree-sitter-parsers-win32-${arch === 'arm64' ? 'arm64' : 'x64'}`;
      break;
    default:
      throw new Error(`Unsupported platform: ${platform} ${arch}`);
  }
  
  return platformPackage;
}

function getBinaryPath() {
  const platformPackage = getPlatformPackage();
  
  try {
    // Try to resolve the platform-specific package
    const packagePath = require.resolve(platformPackage);
    const packageDir = path.dirname(packagePath);
    
    // Map platform to expected binary filename
    const platform = os.platform();
    const arch = os.arch();
    let binaryName;
    
    switch (platform) {
      case 'darwin':
        binaryName = `libtree-sitter-parsers-all-macos-${arch === 'arm64' ? 'aarch64' : 'x86_64'}.a`;
        break;
      case 'linux':
        const isMusl = platformPackage.includes('musl');
        const archName = arch === 'arm64' ? 'aarch64' : 'x86_64';
        binaryName = `libtree-sitter-parsers-all-linux-${archName}-${isMusl ? 'musl' : 'glibc'}.a`;
        break;
      case 'win32':
        binaryName = `libtree-sitter-parsers-all-windows-${arch === 'arm64' ? 'aarch64' : 'x86_64'}.a`;
        break;
    }
    
    const binaryPath = path.join(packageDir, binaryName);
    
    if (fs.existsSync(binaryPath)) {
      return binaryPath;
    }
    
    // Fallback to downloaded binary location
    const fallbackPath = path.join(__dirname, 'binaries', binaryName);
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
    
    throw new Error(`Binary not found at ${binaryPath} or ${fallbackPath}`);
  } catch (error) {
    // Platform package not installed, check fallback location
    const fallbackDir = path.join(__dirname, 'binaries');
    if (fs.existsSync(fallbackDir)) {
      const files = fs.readdirSync(fallbackDir);
      const binary = files.find(f => f.endsWith('.a'));
      if (binary) {
        return path.join(fallbackDir, binary);
      }
    }
    
    throw new Error(`Could not find tree-sitter parsers binary. Platform package ${platformPackage} not installed and no fallback binary found.`);
  }
}

function getMetadataPath() {
  const binaryPath = getBinaryPath();
  const dir = path.dirname(binaryPath);
  const binaryName = path.basename(binaryPath, '.a');
  const metadataName = binaryName.replace('libtree-sitter-parsers-all-', 'grammars-') + '.json';
  return path.join(dir, metadataName);
}

const binaryPath = getBinaryPath();
const metadataPath = getMetadataPath();

module.exports = {
  binaryPath,
  metadataPath,
  platformPackage: getPlatformPackage(),
  
  // Utility function to get all available grammars
  getGrammars() {
    try {
      return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (error) {
      console.error('Failed to load grammars metadata:', error);
      return [];
    }
  }
};