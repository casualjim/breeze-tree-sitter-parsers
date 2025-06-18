#!/usr/bin/env node

/**
 * Validation script for tree-sitter parsers
 * Tests that the built libraries can actually be linked and used by Rust
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine current platform
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
    console.error(`Unsupported architecture: ${machine}`);
    process.exit(1);
  }

  // Check for musl on Linux
  if (platformName === 'linux') {
    try {
      const { execSync } = require('child_process');
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

// Check if a library file exists for the platform
function checkLibraryExists(platform) {
  const distDir = path.join(__dirname, 'dist');
  const expectedLib = `libtree-sitter-parsers-all-${platform}.a`;
  const libPath = path.join(distDir, expectedLib);
  
  return fs.existsSync(libPath);
}

// Run cargo build/test in the validation directory
async function runValidation() {
  console.log('🔍 Running tree-sitter parsers validation...\n');
  
  const platform = getCurrentPlatform();
  console.log(`Detected platform: ${platform}`);
  
  // Check if library exists
  if (!checkLibraryExists(platform)) {
    console.error(`❌ Library for platform ${platform} not found!`);
    console.error(`Expected: dist/libtree-sitter-parsers-all-${platform}.a`);
    console.error(`Run 'npm run build' or 'npm run build:all' first.`);
    process.exit(1);
  }
  
  console.log(`✅ Found library for ${platform}`);
  console.log('📦 Building validation project...\n');
  
  const validationDir = path.join(__dirname, 'validation');
  
  return new Promise((resolve, reject) => {
    // First, build the validation project
    const buildProcess = spawn('cargo', ['build', '--release'], {
      cwd: validationDir,
      stdio: 'pipe'
    });
    
    let buildStdout = '';
    let buildStderr = '';
    
    buildProcess.stdout.on('data', (data) => {
      buildStdout += data.toString();
    });
    
    buildProcess.stderr.on('data', (data) => {
      buildStderr += data.toString();
    });
    
    buildProcess.on('close', (buildCode) => {
      if (buildCode !== 0) {
        console.error('❌ Validation build failed!');
        console.error('This indicates the libraries cannot be linked properly.\n');
        console.error('Build stderr:');
        console.error(buildStderr);
        if (buildStdout) {
          console.error('\nBuild stdout:');
          console.error(buildStdout);
        }
        reject(new Error(`Build failed with code ${buildCode}`));
        return;
      }
      
      console.log('✅ Validation project built successfully');
      console.log('🚀 Running validation tests...\n');
      
      // Now run the validation
      const runProcess = spawn('cargo', ['run', '--release'], {
        cwd: validationDir,
        stdio: 'pipe'
      });
      
      let runStdout = '';
      let runStderr = '';
      
      runProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(output.replace(/\n$/, ''));
        runStdout += output;
      });
      
      runProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(output.replace(/\n$/, ''));
        runStderr += output;
      });
      
      runProcess.on('close', (runCode) => {
        if (runCode === 0) {
          console.log('\n🎉 Validation passed! Libraries are working correctly.');
          resolve();
        } else {
          console.error('\n💥 Validation failed!');
          console.error('This indicates the libraries have runtime issues.');
          reject(new Error(`Validation failed with code ${runCode}`));
        }
      });
    });
  });
}

// Main execution
if (require.main === module) {
  runValidation().catch(error => {
    console.error('\n💥 Validation failed:', error.message);
    process.exit(1);
  });
}

module.exports = { runValidation, getCurrentPlatform, checkLibraryExists };