# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a build system that creates a unified npm package containing Tree-sitter parsers for 163 programming languages as statically linked binaries for multiple platforms. The build process uses Zig for cross-compilation to ensure consistent builds across all target platforms.

## Key Commands

```bash
# Full build (fetch + compile) for current platform
npm run build
# OR directly: node build-grammars.js

# Only fetch grammar repositories
npm run fetch
# OR: node build-grammars.js --fetch-only

# Only compile grammars (requires prior fetch)
npm run compile
# OR: node build-grammars.js --compile-only

# Build for specific platform
node build-grammars.js --platform linux-x86_64-glibc

# Build for all platforms (requires Zig installed)
npm run build:all
# OR: node build-grammars.js --all-platforms

# Control parallelism (default: CPU count)
node build-grammars.js -j 8

# Create npm packages for distribution
npm run create-packages

# Publish all packages (after building)
npm run publish-all
```

## Architecture

The build system consists of:

1. **`build-grammars.js`** - Main JavaScript build script that orchestrates the entire build process
2. **`grammars.json`** - Configuration file listing all 163 grammars with their GitHub repos and specific revisions
3. **Build phases**:
   - **Fetch**: Clones grammar repositories into `grammars/` directory
   - **Compile**: Builds each grammar's parser.c and scanner files into static libraries
   - **Combine**: Merges all grammar libraries into a single archive per platform

## NPM Package Distribution

The project uses npm for binary distribution:

1. **Main package** (`@kumos/tree-sitter-parsers`) - Platform detection and binary path resolution
2. **Platform packages** (e.g., `@kumos/tree-sitter-parsers-darwin-arm64`) - Platform-specific binaries
3. **Fallback mechanism** - Downloads binaries from GitHub releases if platform package unavailable

Key files:
- `index.js` - Exports binary path and metadata path
- `postinstall.js` - Fallback binary downloader
- `bin/tree-sitter-parsers-path.js` - CLI tool to get binary path
- `create-platform-packages.js` - Creates platform-specific npm packages
- `publish-packages.sh` - Automates publishing all packages

## Important Implementation Details

- **Symbol Prefixing**: Each grammar's symbols are prefixed (e.g., `ts_{grammar_name}_scan`) to avoid conflicts when combined
- **Scanner Handling**: Automatically detects and handles both C and C++ scanners, creating marker files for C++ grammars
- **Cross-Compilation**: Uses Zig's compiler and ar tool for consistent builds across platforms
- **Platform Targets**: Supports Linux (glibc/musl), Windows, and macOS on both x86_64 and aarch64
- **Output**: Creates `dist/libtree-sitter-parsers-all-{platform}.a` and `dist/grammars-{platform}.json` for each platform

## Working with Grammars

When adding or modifying grammars:
1. Update `grammars.json` with the grammar details
2. Test fetch with `npm run fetch`
3. Test compilation with `npm run compile`
4. Special cases need handling in the build script (e.g., custom paths, symbol names)

The build script handles various grammar quirks automatically:
- Grammars in subdirectories (via `path` field)
- Custom symbol names (via `symbol_name` field)
- Missing generated files (runs `tree-sitter generate` when needed)
- Both `scanner.c` and `scanner.cc` files