# Breeze Tree-sitter Parsers

Pre-compiled Tree-sitter parsers for 344 programming languages, distributed as native binaries via npm.

## Installation

```bash
npm install @kumos/tree-sitter-parsers
```

The appropriate binary for your platform will be automatically downloaded during installation.

## Usage

### Get the binary path

```js
const { binaryPath, metadataPath } = require('@kumos/tree-sitter-parsers');

console.log(binaryPath); // Path to the static library
console.log(metadataPath); // Path to the grammars metadata JSON
```

### Command-line usage

```bash
# Get the path to the binary for your current platform
npx @kumos/tree-sitter-parsers

# Get the path for a specific platform
npx @kumos/tree-sitter-parsers --os linux --arch x64 --variant musl

# Get the metadata file path instead of binary
npx @kumos/tree-sitter-parsers --metadata

# Get macOS ARM64 binary path
npx @kumos/tree-sitter-parsers --os darwin --arch arm64

# Show help
npx @kumos/tree-sitter-parsers --help
```

#### CLI Options

- `--os <os>` - Target OS: `darwin`, `linux`, or `win32`
- `--arch <arch>` - Target architecture: `x64` or `arm64`
- `--variant <variant>` - Target variant (Linux only): `glibc` or `musl`
- `--metadata` - Return metadata JSON path instead of binary path
- `--help` - Show help message

### Build tools integration

The binary path can be used in build scripts:

```bash
# In a build script
PARSER_LIB=$(npx @kumos/tree-sitter-parsers)
gcc myapp.c $PARSER_LIB -o myapp

# Cross-compilation example
LINUX_PARSER=$(npx @kumos/tree-sitter-parsers --os linux --arch x64)
x86_64-linux-gnu-gcc myapp.c $LINUX_PARSER -o myapp-linux
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

- Node.js 20+
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

# Validate built libraries (recommended)
npm run validate

# Build and validate in one step
npm run build:validated
npm run build:all:validated
```

### Validation

The project includes a validation system that tests the actual linking and usage of the built libraries:

```bash
# Validate current platform binaries
npm run validate
```

This validation:
- ✅ Tests actual Rust linking (catches MSVC/MinGW compatibility issues)
- ✅ Verifies grammar loading and function calls work correctly
- ✅ Tests basic parsing functionality
- ✅ Runs the exact same code path as consuming projects

**Important**: Always run validation before publishing or in CI pipelines to catch binary compatibility issues early.

## Architecture

This project consists of:

1. **Main package** (`@kumos/tree-sitter-parsers`) - Platform detection and binary resolution
2. **Platform packages** - Platform-specific binaries (e.g., `@kumos/tree-sitter-parsers-darwin-arm64`)

The main package uses npm's `optionalDependencies` to install only the relevant platform binary. If the platform package isn't available, it falls back to downloading the binary from GitHub releases.

## License

MIT
we got the language list from https://github.com/nvim-treesitter/nvim-treesitter/blob/main/SUPPORTED_LANGUAGES.md
