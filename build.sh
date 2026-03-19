#!/bin/bash
set -e

echo "🔨 Building Codex Account Pool..."

# Install dependencies at root
echo "📦 Installing root dependencies..."
npm install

# Build packages in order
echo "📦 Building @codex-pool/core..."
cd packages/core
npm install
npm run build
cd ../..

echo "📦 Building @codex-pool/browser..."
cd packages/browser
npm install
npm run build
cd ../..

echo "📦 Building @codex-pool/cli..."
cd packages/cli
npm install
npm run build
cd ../..

echo ""
echo "✅ Build complete!"
echo ""
echo "Next steps:"
echo "  1. Run setup: npm run setup"
echo "  2. Source env: source ~/.codex-pool/.env"
echo "  3. Add account: ./packages/cli/dist/cli.js account add -e your@email.com"
