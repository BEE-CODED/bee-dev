#!/bin/bash
# Archive spec-specific memory entries when starting a new spec.
# Called by /bee:new-spec before creating a new spec directory, and by
# /bee:complete-spec / /bee:archive-spec during the ceremony.
#
# Usage: archive-memory.sh [previous-spec-name]
#
# 1. Moves memory/ to memory-archive/{spec-name}/
# 2. Creates fresh memory/ with only project-level entries from shared.md
# 3. Project-level = entries about patterns, conventions, prefs (not feature-specific)
#
# Output contract (one line to stdout per outcome):
#   success w/ content: "archived N file(s) to .bee/memory-archive/{spec}/"
#   no-op (no dir):     "no memory to archive (no .bee/memory/ directory)"
#   no-op (empty):      "no memory to archive (no shared entries found)"
#   error:              "error: {reason}" to stderr, exit 1
#
# Consumers (complete-spec.md, archive-spec.md, new-spec.md) capture stdout
# and surface it to the user so memory archival is no longer a silent step.

BEE_DIR="$CLAUDE_PROJECT_DIR/.bee"
MEMORY_DIR="$BEE_DIR/memory"
SPEC_NAME="${1:-unknown}"

# Skip if no memory directory
if [ ! -d "$MEMORY_DIR" ]; then
  echo "no memory to archive (no .bee/memory/ directory)"
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
  # No actual entries; nothing to archive
  echo "no memory to archive (no shared entries found)"
  exit 0
fi

# Archive current memory
ARCHIVE_DIR="$BEE_DIR/memory-archive/$SPEC_NAME"
if ! mkdir -p "$ARCHIVE_DIR"; then
  echo "error: failed to create archive directory $ARCHIVE_DIR" >&2
  exit 1
fi

# Count files that will actually be copied, then copy them. Using a loop so we
# can count and still guard each cp for failure.
COUNT=0
for f in "$MEMORY_DIR"/*.md; do
  [ -f "$f" ] || continue
  if ! cp "$f" "$ARCHIVE_DIR/" 2>/dev/null; then
    echo "error: failed to copy $f to $ARCHIVE_DIR" >&2
    exit 1
  fi
  COUNT=$((COUNT + 1))
done

# Extract project-level entries from shared.md
# Project-level entries: patterns, conventions, preferences, environment, stack
# Spec-level entries: references to specific features, components, routes
SHARED="$MEMORY_DIR/shared.md"
if [ -f "$SHARED" ]; then
  # Keep entries that mention generic project concepts
  # Filter using keywords that indicate project-level knowledge
  # Use \< and \> word boundaries so short keywords (ci, git, build) don't
  # substring-match common words (decision, digit, rebuild) and leak
  # spec-specific entries into the post-archive shared.md.
  grep "^- " "$SHARED" | grep -iE \
    '\<(pattern|convention|prefer|always use|never use|stack|directory|structure|config|environment|setup|linter|test runner|naming|style|workflow|git|deploy|build|CI|database|migration)\>' \
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

echo "archived $COUNT file(s) to .bee/memory-archive/$SPEC_NAME/"
exit 0
