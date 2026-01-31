#!/usr/bin/env bash

echo "Checking grammars using 'master' branch for 'main' branch availability..."
echo ""

# Get all grammars with branch: "master"
jq -r '.grammars[] | select(.branch == "master") | "\(.name)\t\(.repo)\t\(.path // "")"' grammars.json | while IFS=$'\t' read -r name repo path; do
  # Extract owner/repo from the URL
  repo_path=$(echo "$repo" | sed -E 's|https://github.com/([^/]+/[^/.]+).*|\1|')

  # Skip if not a github repo
  if [[ ! "$repo" =~ github.com ]]; then
    continue
  fi

  # Check if main branch exists
  if gh api "repos/${repo_path}/branches/main" --jq '.name' >/dev/null 2>&1; then
    # Build file path - if path is set, use it; otherwise check root
    file_prefix="${path:+${path}/}"

    has_grammar_js=false
    has_parser_c=false
    has_grammar_json=false

    master_grammar_js=false
    master_parser_c=false

    # Check main branch files
    if gh api "repos/${repo_path}/contents/${file_prefix}grammar.js?ref=main" --jq '.name' >/dev/null 2>&1; then
      has_grammar_js=true
    fi

    if gh api "repos/${repo_path}/contents/${file_prefix}src/parser.c?ref=main" --jq '.name' >/dev/null 2>&1; then
      has_parser_c=true
    fi

    if gh api "repos/${repo_path}/contents/${file_prefix}grammar.json?ref=main" --jq '.name' >/dev/null 2>&1; then
      has_grammar_json=true
    fi

    # Check master branch files (to see if current is valid)
    if gh api "repos/${repo_path}/contents/${file_prefix}grammar.js?ref=master" --jq '.name' >/dev/null 2>&1; then
      master_grammar_js=true
    fi

    if gh api "repos/${repo_path}/contents/${file_prefix}src/parser.c?ref=master" --jq '.name' >/dev/null 2>&1; then
      master_parser_c=true
    fi

    echo "FOUND: $name"
    echo "  Repo: $repo"
    echo "  Path: ${path:-<root>}"
    echo "  Current branch: master"
    echo "  master files: grammar.js=$master_grammar_js, parser.c=$master_parser_c"
    echo "  main branch files:"
    echo "    grammar.js: $has_grammar_js"
    echo "    src/parser.c: $has_parser_c"
    echo "    grammar.json: $has_grammar_json"

    if [[ "$has_parser_c" == "true" ]]; then
      echo "  Status: FULL COMPAT (has parser.c, can switch directly)"
    elif [[ "$has_grammar_js" == "true" ]]; then
      echo "  Status: NEEDS GENERATION (has grammar.js, must run tree-sitter generate)"
    elif [[ "$has_grammar_json" == "true" ]]; then
      echo "  Status: INCOMPLETE (only grammar.json)"
    else
      echo "  Status: NO VALID GRAMMAR on main"
      if [[ "$master_parser_c" == "false" ]] && [[ "$master_grammar_js" == "false" ]]; then
        echo "  WARNING: master also appears invalid!"
      fi
    fi
    echo ""
  fi
done

echo "================================"
