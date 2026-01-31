#!/usr/bin/env bash

# Read grammars.json and extract repo URLs
grammars=$(jq -r '.grammars[].repo' grammars.json)

total=0
duplicates=0
declare -a dup_list

while IFS= read -r repo; do
  ((total++))

  # Extract the repo name (last part after /)
  repo_name=$(basename "$repo" .git)

  # Check if it's NOT already from tree-sitter-grammars
  if [[ ! "$repo" =~ tree-sitter-grammars ]]; then
    # Check if the same repo exists in tree-sitter-grammars org (using curl)
    http_status=$(curl -s -o /dev/null -w "%{http_code}" "https://api.github.com/repos/tree-sitter-grammars/$repo_name")
    sleep 0.1  # Rate limit avoidance
    if [[ "$http_status" == "200" ]]; then
      ((duplicates++))
      dup_list+=("$repo_name")
      echo "FOUND: $repo_name"
      echo "  Current:  $repo"
      echo "  Also at:  https://github.com/tree-sitter-grammars/$repo_name"
      echo ""
    fi
  fi
done <<< "$grammars"

echo "================================"
echo "Total grammars checked: $total"
echo "Found duplicates in tree-sitter-grammars: $duplicates"

if [ $duplicates -gt 0 ]; then
  echo ""
  echo "Duplicate repo names:"
  printf '  - %s\n' "${dup_list[@]}"
fi
