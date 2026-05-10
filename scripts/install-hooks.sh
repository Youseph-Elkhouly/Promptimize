#!/bin/bash
# Installs optional Husky pre-push hook for Promptimize CostDiff

set -e

echo "Installing Promptimize Git hooks..."

mkdir -p .husky

cat > .husky/pre-push << 'EOF'
#!/bin/sh
echo "Promptimize: Running CostDiff check..."
npx ts-node scripts/run-cost-diff.ts
EXIT_CODE=$?
if [ $EXIT_CODE -eq 1 ]; then
  echo "Promptimize: Budget exceeded. Review AI costs before pushing."
  echo "  Set PROMPTIMIZE_BLOCK_ON_BUDGET_FAIL=false to disable blocking."
  if [ "$PROMPTIMIZE_BLOCK_ON_BUDGET_FAIL" != "false" ]; then
    exit 1
  fi
fi
EOF

chmod +x .husky/pre-push

# Install husky if not present
if ! command -v husky &> /dev/null; then
  npm install --save-dev husky
  npx husky install
fi

echo "Done. Pre-push CostDiff hook installed."
echo "To disable blocking: export PROMPTIMIZE_BLOCK_ON_BUDGET_FAIL=false"
