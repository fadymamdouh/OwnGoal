#!/usr/bin/env bash
# Pushes this folder to GitHub. Run it from inside the folder:  bash push.sh
set -e
REMOTE="https://github.com/fadymamdouh/OwnGoal.git"

[ -f render.yaml ] || { echo "render.yaml not found — run this from the project root"; exit 1; }

git init -q
git add .
git commit -qm "OWN GOAL — rules engine, game server, web client, print files" || true
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"

echo
echo "Pushing to $REMOTE"
echo "Git will ask you to sign in — use the browser prompt, or 'gh auth login' first."
echo

if ! git push -u origin main; then
  echo
  echo "Push rejected. The repo probably already has commits. Merging and retrying:"
  git pull origin main --rebase --allow-unrelated-histories
  git push -u origin main
fi

echo
echo "Done. Next: render.com -> New -> Blueprint -> pick the OwnGoal repo."
