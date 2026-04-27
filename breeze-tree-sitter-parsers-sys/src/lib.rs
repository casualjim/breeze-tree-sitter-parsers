//! Rust bindings for the prebuilt `breeze-tree-sitter-parsers` static library.
//!
//! This crate's `build.rs` downloads the matching platform `.a` from the
//! [breeze-tree-sitter-parsers GitHub release][rel] for the crate version,
//! caches it under `$CARGO_HOME/breeze-tree-sitter-parsers-cache/v<version>/<platform>/`,
//! links it statically, and generates a `language_fn(name) -> Option<LanguageFn>`
//! lookup from the per-platform `grammars-<platform>.json` metadata.
//!
//! Override the download with `BREEZE_TREE_SITTER_PARSERS_LIB=<path/to/lib.a>`.
//! Metadata is read from a sibling `grammars-<platform>.json` by default; override
//! with `BREEZE_TREE_SITTER_PARSERS_METADATA=<path/to/grammars.json>`.
//! Override the version with `BREEZE_TREE_SITTER_PARSERS_VERSION=<x.y.z>`.
//!
//! # Example
//!
//! ```no_run
//! use tree_sitter::{Language, Parser};
//!
//! let lang_fn = breeze_tree_sitter_parsers_sys::language_fn("rust").unwrap();
//! let language: Language = lang_fn.into();
//! let mut parser = Parser::new();
//! parser.set_language(&language).unwrap();
//! let tree = parser.parse("fn main() {}", None).unwrap();
//! assert!(tree.root_node().child_count() > 0);
//! ```
//!
//! [rel]: https://github.com/casualjim/breeze-tree-sitter-parsers/releases

pub use tree_sitter_language::LanguageFn;

include!(concat!(env!("OUT_DIR"), "/bindings.rs"));
