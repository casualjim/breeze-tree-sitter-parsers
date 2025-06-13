#!/bin/bash

set -e

echo "Publishing Tree-sitter Parsers packages..."

# Function to copy binaries to platform directory
copy_binaries() {
    local platform=$1
    local binary=$2
    local metadata=$3
    
    local platform_dir="platforms/$platform"
    local binary_source="dist/$binary"
    local metadata_source="dist/$metadata"
    
    if [ -f "$binary_source" ] && [ -f "$metadata_source" ]; then
        echo "Copying files for $platform..."
        # Remove symlinks
        rm -f "$platform_dir/$binary" "$platform_dir/$metadata"
        # Copy actual files
        cp "$binary_source" "$platform_dir/$binary"
        cp "$metadata_source" "$platform_dir/$metadata"
        echo "✓ Copied files for $platform"
    else
        echo "✗ Missing files for $platform, skipping..."
        return 1
    fi
    return 0
}

# Copy binaries to platform directories
echo "Copying binaries to platform packages..."

copy_binaries "darwin-x64" "libtree-sitter-all-macos-x86_64.a" "grammars-macos-x86_64.json"
copy_binaries "darwin-arm64" "libtree-sitter-all-macos-aarch64.a" "grammars-macos-aarch64.json"
copy_binaries "linux-x64" "libtree-sitter-all-linux-x86_64-glibc.a" "grammars-linux-x86_64-glibc.json"
copy_binaries "linux-arm64" "libtree-sitter-all-linux-aarch64-glibc.a" "grammars-linux-aarch64-glibc.json"
copy_binaries "linux-x64-musl" "libtree-sitter-all-linux-x86_64-musl.a" "grammars-linux-x86_64-musl.json"
copy_binaries "linux-arm64-musl" "libtree-sitter-all-linux-aarch64-musl.a" "grammars-linux-aarch64-musl.json"
copy_binaries "win32-x64" "libtree-sitter-all-windows-x86_64.a" "grammars-windows-x86_64.json"
copy_binaries "win32-arm64" "libtree-sitter-all-windows-aarch64.a" "grammars-windows-aarch64.json"

# Publish platform packages
echo -e "\nPublishing platform packages..."

for platform_dir in platforms/*/; do
    if [ -d "$platform_dir" ]; then
        platform=$(basename "$platform_dir")
        echo "Publishing @breeze/tree-sitter-parsers-$platform..."
        
        # Check if binary exists before publishing
        binary_files=$(find "$platform_dir" -name "*.a" -type f)
        if [ -n "$binary_files" ]; then
            (cd "$platform_dir" && npm publish --access public) || echo "Failed to publish $platform"
        else
            echo "Skipping $platform - no binary found"
        fi
    fi
done

# Publish main package
echo -e "\nPublishing main package..."
npm publish --access public

echo -e "\n✅ Publishing complete!"