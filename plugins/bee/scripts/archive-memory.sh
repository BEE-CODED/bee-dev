#!/bin/bash
# Archive spec-specific memory entries when starting a new spec.
# Called by /bee:new-spec before creating a new spec directory.
#
# Usage: archive-memory.sh [previous-spec-name]
#
# 1. Moves memory/ to memory-archive/{spec-name}/
# 2. Creates fresh memory/ with only project-level entries from shared.md
# 3. Project-level = entries about patterns, conventions, prefs (not feature-specific)

BEE_DIR="$CLAUDE_PROJECT_DIR/.bee"
MEMORY_DIR="$BEE_DIR/memory"
SPEC_NAME="${1:-unknown}"

# Skip if no memory directory or it's empty
if [ ! -d "$MEMORY_DIR" ]; then
  exit 0
fi

# Check if there are any .md files with actual content
HAS_CONTENT=false
for f in "$MEMORY_DIR"/*.md; do
  [ -f "$f" ] || continue
  if grep -q "^- " "$f" 2>/dev/null; then
    HAS_CONTENT=true
    break
  fi
done

if [ "$HAS_CONTENT" = "false" ]; then
  # No actual entries, just clean up empty files
  exit 0
fi

# Archive current memory
ARCHIVE_DIR="$BEE_DIR/memory-archive/$SPEC_NAME"
mkdir -p "$ARCHIVE_DIR"
cp "$MEMORY_DIR"/*.md "$ARCHIVE_DIR/" 2>/dev/null

# Extract project-level entries from shared.md
# Project-level entries: patterns, conventions, preferences, environment, stack
# Spec-level entries: references to specific features, components, routes
SHARED="$MEMORY_DIR/shared.md"
if [ -f "$SHARED" ]; then
  # Keep entries that mention generic project concepts
  # Filter using keywords that indicate project-level knowledge
  grep "^- " "$SHARED" | grep -iE \
    "pattern|convention|prefer|always use|never use|stack|directory|structure|config|environment|setup|linter|test runner|naming|style|workflow|git|deploy|build|CI|database|migration" \
    > "$MEMORY_DIR/shared.md.tmp" 2>/dev/null || true

  if [ -s "$MEMORY_DIR/shared.md.tmp" ]; then
    mv "$MEMORY_DIR/shared.md.tmp" "$SHARED"
  else
    rm -f "$MEMORY_DIR/shared.md.tmp" "$SHARED"
  fi
fi

# Clear agent-specific memory files (they accumulate spec-specific knowledge)
for f in "$MEMORY_DIR"/*.md; do
  [ -f "$f" ] || continue
  BASENAME=$(basename "$f")
  # Keep shared.md (already filtered above)
  if [ "$BASENAME" = "shared.md" ]; then
    continue
  fi
  # Remove agent-specific files -- they'll be recreated as agents learn
  rm -f "$f"
done

exit 0
