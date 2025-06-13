# Breeze Tree-sitter Parsers

This repository provides a collection of [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) parsers, compiled into statically linked binaries for multiple platforms. The main npm package, `@breeze/tree-sitter-parsers`, automatically pulls in the correct platform-specific binary as an optional dependency, making installation and usage seamless.

## Features

- 🚀 Multiple Tree-sitter parsers bundled together
- 🛠️ Statically linked binaries for each supported platform (Linux, macOS, Windows, etc.)
- 📦 Single npm package with platform-specific binaries as optional dependencies
- 🔒 No runtime dependencies—just install and use

## Usage

1. **Install the package:**

   ```sh
   npm install @breeze/tree-sitter-parsers
   ```

   The correct binary for your platform will be installed automatically.

2. **Supported Platforms:**
   - macOS (darwin)
   - Linux (x64, arm64, etc.)
   - Windows (win32)
   - (More platforms can be added as needed)

## Retrieving the Binary Path

You can retrieve the path to the platform-specific binary for use in other build steps or scripts:

### CLI

```sh
npx @breeze/tree-sitter-parsers --print-binary-path
```

This will print the absolute path to the binary for your platform.

### Programmatic Usage

```js
const { getBinaryPath } = require('@breeze/tree-sitter-parsers');
console.log(getBinaryPath());
```

Use this in your build scripts to locate the binary as needed.

## How It Works

- The main package (`@breeze/tree-sitter-parsers`) declares platform-specific binaries as optional dependencies.
- During installation, npm/yarn/pnpm will fetch the correct binary for your platform.
- The package provides a CLI and API to retrieve the binary path for integration with other tools.

## Development

- Parsers are compiled using cross-compilation toolchains.
- Each binary is statically linked to avoid external dependencies.
- Platform-specific binaries are published as optional dependencies.

## Contributing

Contributions are welcome! Please open issues or pull requests for new parsers, platform support, or improvements.

## License

[MIT](./LICENSE)
