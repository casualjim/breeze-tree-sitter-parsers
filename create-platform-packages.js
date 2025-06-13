#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const platforms = [
  { 
    npmName: 'darwin-x64', 
    binaryName: 'libtree-sitter-parsers-all-macos-x86_64.a',
    metadataName: 'grammars-macos-x86_64.json',
    description: 'macOS x64'
  },
  { 
    npmName: 'darwin-arm64', 
    binaryName: 'libtree-sitter-parsers-all-macos-aarch64.a',
    metadataName: 'grammars-macos-aarch64.json',
    description: 'macOS ARM64'
  },
  { 
    npmName: 'linux-x64', 
    binaryName: 'libtree-sitter-parsers-all-linux-x86_64-glibc.a',
    metadataName: 'grammars-linux-x86_64-glibc.json',
    description: 'Linux x64 (glibc)'
  },
  { 
    npmName: 'linux-arm64', 
    binaryName: 'libtree-sitter-parsers-all-linux-aarch64-glibc.a',
    metadataName: 'grammars-linux-aarch64-glibc.json',
    description: 'Linux ARM64 (glibc)'
  },
  { 
    npmName: 'linux-x64-musl', 
    binaryName: 'libtree-sitter-parsers-all-linux-x86_64-musl.a',
    metadataName: 'grammars-linux-x86_64-musl.json',
    description: 'Linux x64 (musl)'
  },
  { 
    npmName: 'linux-arm64-musl', 
    binaryName: 'libtree-sitter-parsers-all-linux-aarch64-musl.a',
    metadataName: 'grammars-linux-aarch64-musl.json',
    description: 'Linux ARM64 (musl)'
  },
  { 
    npmName: 'win32-x64', 
    binaryName: 'libtree-sitter-parsers-all-windows-x86_64.a',
    metadataName: 'grammars-windows-x86_64.json',
    description: 'Windows x64'
  },
  { 
    npmName: 'win32-arm64', 
    binaryName: 'libtree-sitter-parsers-all-windows-aarch64.a',
    metadataName: 'grammars-windows-aarch64.json',
    description: 'Windows ARM64'
  }
];

const version = require('./package.json').version;

platforms.forEach(platform => {
  const packageName = `@breeze/tree-sitter-parsers-${platform.npmName}`;
  const packageDir = path.join(__dirname, 'platforms', platform.npmName);
  
  // Create directory
  if (!fs.existsSync(packageDir)) {
    fs.mkdirSync(packageDir, { recursive: true });
  }
  
  // Create package.json
  const packageJson = {
    name: packageName,
    version: version,
    description: `Tree-sitter parsers binary for ${platform.description}`,
    main: "index.js",
    files: [
      platform.binaryName,
      platform.metadataName,
      "index.js"
    ],
    keywords: ["tree-sitter", "parser", "binary", platform.npmName],
    author: "",
    license: "MIT",
    repository: {
      type: "git",
      url: "https://github.com/casualjim/breeze-tree-sitter-parsers.git",
      directory: `platforms/${platform.npmName}`
    },
    os: platform.npmName.startsWith('darwin') ? ['darwin'] : 
        platform.npmName.startsWith('linux') ? ['linux'] : 
        platform.npmName.startsWith('win32') ? ['win32'] : undefined,
    cpu:  platform.npmName.includes('arm64') ? ['arm64'] : 
          platform.npmName.includes('x64') ? ['x64'] : undefined
  };
  
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n'
  );
  
  // Create index.js
  const indexJs = `// This file exists for package resolution
module.exports = __filename;
`;
  
  fs.writeFileSync(
    path.join(packageDir, 'index.js'),
    indexJs
  );
  
  // Create .npmignore to ensure binary is included
  const npmignore = `# Include everything
!${platform.binaryName}
!${platform.metadataName}
!index.js
!package.json
`;
  
  fs.writeFileSync(
    path.join(packageDir, '.npmignore'),
    npmignore
  );
  
  // Copy the actual binaries (not symlinks)
  const binarySource = path.join(__dirname, 'dist', platform.binaryName);
  const metadataSource = path.join(__dirname, 'dist', platform.metadataName);
  const binaryDest = path.join(packageDir, platform.binaryName);
  const metadataDest = path.join(packageDir, platform.metadataName);
  
  // Remove existing files if they exist
  [binaryDest, metadataDest].forEach(dest => {
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }
  });
  
  // Copy files if source files exist
  if (fs.existsSync(binarySource)) {
    fs.copyFileSync(binarySource, binaryDest);
    console.log(`Copied ${platform.binaryName}`);
  } else {
    console.log(`Warning: Binary not found at ${binarySource}`);
  }
  
  if (fs.existsSync(metadataSource)) {
    fs.copyFileSync(metadataSource, metadataDest);
    console.log(`Copied ${platform.metadataName}`);
  } else {
    console.log(`Warning: Metadata not found at ${metadataSource}`);
  }
  
  console.log(`Created package structure for ${packageName}`);
});

console.log('\nAll platform packages created successfully!');
console.log('\nTo publish:');
console.log('1. Build all platform binaries using: npm run build:all');
console.log('2. Run: npm run create-packages (to copy binaries)');
console.log('3. Run: npm run publish-all');