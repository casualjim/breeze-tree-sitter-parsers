const os = require('os');
const fs = require('fs');

console.log('Platform:', os.platform());
console.log('Arch:', os.arch());

// Check for musl
const isMusl = (() => {
  try {
    // First try ldd
    const { execSync } = require('child_process');
    const lddOutput = execSync('ldd --version 2>&1', { encoding: 'utf8' });
    console.log('ldd output:', lddOutput.substring(0, 100));
    if (lddOutput.includes('musl')) return true;
  } catch (e) {
    console.log('ldd failed:', e.message);
  }
  
  // Check if /lib/ld-musl* exists (Alpine/musl systems)
  try {
    const files = fs.readdirSync('/lib');
    const muslFiles = files.filter(f => f.startsWith('ld-musl'));
    console.log('musl files in /lib:', muslFiles);
    return muslFiles.length > 0;
  } catch (e) {
    console.log('Failed to read /lib:', e.message);
    return false;
  }
})();

console.log('Is musl?', isMusl);

// Determine package name
const platform = os.platform();
const arch = os.arch();

let npmPackage;
switch (platform) {
  case 'darwin':
    npmPackage = `@kumos/tree-sitter-parsers-darwin-${arch}`;
    break;
  case 'linux':
    if (arch === 'x64' || arch === 'x86_64') {
      npmPackage = isMusl ? '@kumos/tree-sitter-parsers-linux-x64-musl' : '@kumos/tree-sitter-parsers-linux-x64';
    } else if (arch === 'arm64' || arch === 'aarch64') {
      npmPackage = isMusl ? '@kumos/tree-sitter-parsers-linux-arm64-musl' : '@kumos/tree-sitter-parsers-linux-arm64';
    }
    break;
  case 'win32':
    npmPackage = `@kumos/tree-sitter-parsers-win32-${arch}`;
    break;
}

console.log('Expected npm package:', npmPackage);

// Check what's in node_modules
try {
  const nodeModules = fs.readdirSync('node_modules/@kumos');
  console.log('Packages in node_modules/@kumos:', nodeModules);
} catch (e) {
  console.log('No @kumos packages found');
}