# Scripts

This directory contains maintenance scripts for keeping `grammars.json` and the local `grammars/<name>/<rev>/...` checkouts consistent.

## Workflow (typical)

1) **Align repos/revs to nvim-treesitter**
   - `scripts/grammars-align-nvim-treesitter.lua`
   - Loads `parsers.lua` from your local `nvim-treesitter` checkout and updates matching entries in `grammars.json`.
   - `julia` is intentionally excluded.

2) **Fetch / build**
   - `build-grammars.js`
   - Fetches repos into `grammars/<grammar>/<rev>/...` and compiles parsers. If `src/parser.c` is missing it may run `tree-sitter generate`.

3) **Query annotations**
   - `scripts/grammars-annotate-highlights.js`
   - Adds `highlights_scm_path` (and some overrides like `wat`) to `grammars.json`.
   - Some grammars are intentionally excluded from auto-detection: `scss`, `brightscript`, `hurl`, `latex`, `sproto`, `supercollider`.

## Utilities

- `scripts/grammars-list-highlights.js`: report which grammars have `queries/**/highlights.scm`
- `scripts/grammars-needs-generation.js`: report which checkouts need `tree-sitter generate` (missing `src/parser.c` but have `grammar.js`)

