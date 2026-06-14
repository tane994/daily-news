#!/bin/bash
# Daily routine entrypoint for launchd (com.andres.daily-news, 07:00 local).
#
# Generates today's edition locally on Claude Max (the cloud sandbox has no
# `claude` CLI and can't run the stateful history.ts pipeline), then commits the
# new snapshot + manifest — which ARE the system's state — and pushes. GitHub
# Pages (.github/workflows/deploy.yml) rebuilds and serves it.
#
# launchd does not source your shell profile, so PATH is set explicitly and must
# include the dir holding `bun` and `claude` (Homebrew: /opt/homebrew/bin).
set -uo pipefail

REPO="/Users/andres/Projects/daily-news"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/andres/.bun/bin:$PATH"
cd "$REPO" || exit 1

echo "=== daily-news run $(date '+%F %T') ==="

# 1. Generate today's snapshot (claude -p / Max; history.ts for continuity).
if ! bun run generate; then
  echo "generate failed — aborting, nothing committed"
  exit 1
fi

# 1b. Fail-safe: never publish a near-empty edition. A transient claude/Max
#     failure (rate-limit burst, network blip) can still write a snapshot with no
#     stories, no Bites and no course lessons. If today's edition is degenerate,
#     keep the previous live edition and bail — do NOT commit or push.
TODAY="$(TZ=Europe/Rome date '+%F')"
SNAP="public/data/snapshots/$TODAY.json"
if [ ! -f "$SNAP" ]; then
  echo "no snapshot written for $TODAY — aborting"
  exit 1
fi
SCORE=$(jq '([.topics[].items[]?]|length) + ((.knowledge.items // [])|length) + ([.courses[]? | select(((.lesson.markdown // "")|length) > 200)]|length)' "$SNAP" 2>/dev/null || echo 0)
echo "edition content score: $SCORE (news items + Bites + real course lessons)"
if [ "${SCORE:-0}" -lt 5 ]; then
  echo "EDITION LOOKS EMPTY (score $SCORE < 5) — generation likely failed; NOT publishing."
  echo "Keeping the previous live edition; discarding the degenerate local files."
  git checkout -- public/data 2>/dev/null || true   # restore tracked snapshots + index
  git clean -fdq public/data 2>/dev/null || true    # drop the new degenerate snapshot
  exit 1
fi

# 2. Commit the snapshot + manifest (the state) and push. No new data → no-op.
git add public/data
if git diff --cached --quiet; then
  echo "no data changes to commit"
else
  git commit -m "data: edition $(date '+%F')"
  if git push origin master; then
    echo "pushed — GitHub Pages will rebuild and publish"
  else
    echo "push failed — commit is local; check git credentials (gh auth setup-git)"
    exit 1
  fi
fi
