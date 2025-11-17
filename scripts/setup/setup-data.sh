#!/bin/bash
# Setup script to download card data files for YGO MCP Server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../../data"
RELEASE_URL="https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download"
VERSION="${1:-v1.0.0}"

echo "=== YGO MCP Server - Data Setup ==="
echo ""
echo "Downloading card data files from GitHub Releases..."
echo "Version: $VERSION"
echo ""

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Download cards-all.tsv
echo "Downloading cards-all.tsv..."
curl -L -o "$DATA_DIR/cards-all.tsv" \
  "$RELEASE_URL/$VERSION/cards-all.tsv" \
  || { echo "Error: Failed to download cards-all.tsv"; exit 1; }

# Download detail-all.tsv
echo "Downloading detail-all.tsv..."
curl -L -o "$DATA_DIR/detail-all.tsv" \
  "$RELEASE_URL/$VERSION/detail-all.tsv" \
  || { echo "Error: Failed to download detail-all.tsv"; exit 1; }

echo ""
echo "✓ Data files downloaded successfully!"
echo ""
echo "Files location:"
echo "  - $DATA_DIR/cards-all.tsv"
echo "  - $DATA_DIR/detail-all.tsv"
echo ""
echo "You can now use the MCP server:"
echo "  node src/ygo-search-card-server.js"
echo ""
