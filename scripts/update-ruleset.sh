#!/usr/bin/env bash
# Fleet-standard branch protection for this repo (idempotent — safe to re-run).
#
# Personal accounts use rulesets, not classic branch protection. This applies
# the two standard rulesets on the default branch plus the merge-policy repo
# settings the chrischall/workflows pipeline depends on:
#
#   1. protect-default-branch — block branch deletion and force-pushes.
#   2. require-pr-and-ci      — require a PR (0 approvals; squash only) and
#      the `ci / ci` required check. The shared reusable-mcp-ci fails fast on
#      un-armed PRs, so an unreviewed PR shows a failing required check and
#      cannot merge until pr-auto-review arms it with `ready-to-merge`.
#
#   Repo settings: squash-only merges (PR title becomes the squash subject —
#   release-please parses it, so it must stay the conventional-commit title),
#   delete merged branches, and Allow auto-merge (load-bearing: without it the
#   auto-merge arm step fails with "Auto merge is not allowed" once the
#   ruleset exists — apply the pair together so they can't drift apart).
#
# Requires: gh CLI authenticated as a repo admin.

set -euo pipefail

REPO="${1:-chrischall/getyourguide-mcp}"

echo "==> $REPO: merge policy + Allow auto-merge"
gh api -X PATCH "repos/$REPO" \
  -F allow_auto_merge=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY >/dev/null

upsert_ruleset() {
  local name="$1" payload="$2" id
  id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id" | head -n1)
  if [ -n "$id" ]; then
    echo "==> Updating ruleset '$name' (id $id)"
    gh api -X PUT "repos/$REPO/rulesets/$id" --input - <<<"$payload" >/dev/null
  else
    echo "==> Creating ruleset '$name'"
    gh api -X POST "repos/$REPO/rulesets" --input - <<<"$payload" >/dev/null
  fi
}

upsert_ruleset "protect-default-branch" '{
  "name": "protect-default-branch",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}'

upsert_ruleset "require-pr-and-ci" '{
  "name": "require-pr-and-ci",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "ci / ci" }
        ]
      }
    }
  ]
}'

echo "Done. Verify: gh api repos/$REPO/rulesets --jq '.[].name' && gh api repos/$REPO --jq .allow_auto_merge"
