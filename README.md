# Breeze Tree-sitter Parsers

Pre-compiled Tree-sitter parsers for 163 programming languages, distributed as native binaries via npm.

## Installation

```bash
npm install @breeze/tree-sitter-parsers
```

The appropriate binary for your platform will be automatically downloaded during installation.

## Usage

### Get the binary path

```js
const { binaryPath, metadataPath } = require('@breeze/tree-sitter-parsers');

console.log(binaryPath); // Path to the static library
console.log(metadataPath); // Path to the grammars metadata JSON
```

### Command-line usage

```bash
# Get the path to the binary
npx tree-sitter-parsers-path
```

### Build tools integration

The binary path can be used in build scripts:

```bash
# In a build script
PARSER_LIB=$(npx tree-sitter-parsers-path)
gcc myapp.c $PARSER_LIB -o myapp
```

## Supported Platforms

- Linux x64 (glibc and musl)
- Linux ARM64 (glibc and musl)  
- macOS x64
- macOS ARM64
- Windows x64
- Windows ARM64

## Building from Source

### Prerequisites

- Node.js 18+
- Git
- Zig (for cross-compilation)
- C/C++ compiler (for native builds)

### Build Commands

```bash
# Clone the repository
git clone https://github.com/casualjim/breeze-tree-sitter-parsers.git
cd breeze-tree-sitter-parsers

# Fetch all grammar repositories
npm run fetch

# Build for current platform
npm run build

# Build for all platforms (requires Zig)
npm run build:all

# Create npm packages for distribution
npm run create-packages
```

## Architecture

This project consists of:

1. **Main package** (`@breeze/tree-sitter-parsers`) - Platform detection and binary resolution
2. **Platform packages** - Platform-specific binaries (e.g., `@breeze/tree-sitter-parsers-darwin-arm64`)

The main package uses npm's `optionalDependencies` to install only the relevant platform binary. If the platform package isn't available, it falls back to downloading the binary from GitHub releases.

## License

MIT