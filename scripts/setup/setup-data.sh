#!/bin/bash
# Setup script to download card data files for YGO MCP Server

set -e

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "Error: curl is not installed. Please install curl first."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../../data"
RELEASE_URL="https://github.com/TomoTom0/ygo-db-local-mcp/releases/download"
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
HTTP_CODE=$(curl -L -w "%{http_code}" -o "$DATA_DIR/cards-all.tsv" -sS \
  "$RELEASE_URL/$VERSION/cards-all.tsv" 2>&1 | tail -n 1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "Error: Failed to download cards-all.tsv (HTTP $HTTP_CODE)"
  echo "URL: $RELEASE_URL/$VERSION/cards-all.tsv"
  echo ""
  echo "Possible reasons:"
  echo "  - Version '$VERSION' does not exist"
  echo "  - Release does not have cards-all.tsv attached"
  echo "  - Network issue"
  echo ""
  echo "Available versions: https://github.com/TomoTom0/ygo-db-local-mcp/releases"
  rm -f "$DATA_DIR/cards-all.tsv"
  exit 1
fi

# Download detail-all.tsv
echo "Downloading detail-all.tsv..."
HTTP_CODE=$(curl -L -w "%{http_code}" -o "$DATA_DIR/detail-all.tsv" -sS \
  "$RELEASE_URL/$VERSION/detail-all.tsv" 2>&1 | tail -n 1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "Error: Failed to download detail-all.tsv (HTTP $HTTP_CODE)"
  echo "URL: $RELEASE_URL/$VERSION/detail-all.tsv"
  rm -f "$DATA_DIR/detail-all.tsv"
  exit 1
fi

# Verify file sizes
CARDS_SIZE=$(stat -f%z "$DATA_DIR/cards-all.tsv" 2>/dev/null || stat -c%s "$DATA_DIR/cards-all.tsv" 2>/dev/null)
DETAIL_SIZE=$(stat -f%z "$DATA_DIR/detail-all.tsv" 2>/dev/null || stat -c%s "$DATA_DIR/detail-all.tsv" 2>/dev/null)

if [ "$CARDS_SIZE" -lt 1000000 ] || [ "$DETAIL_SIZE" -lt 1000000 ]; then
  echo "Error: Downloaded files are too small (possibly error pages)"
  echo "cards-all.tsv: $CARDS_SIZE bytes"
  echo "detail-all.tsv: $DETAIL_SIZE bytes"
  exit 1
fi

echo ""
echo "✓ Data files downloaded successfully!"
echo ""
echo "Files location:"
echo "  - $DATA_DIR/cards-all.tsv ($(numfmt --to=iec-i --suffix=B $CARDS_SIZE 2>/dev/null || echo "$CARDS_SIZE bytes"))"
echo "  - $DATA_DIR/detail-all.tsv ($(numfmt --to=iec-i --suffix=B $DETAIL_SIZE 2>/dev/null || echo "$DETAIL_SIZE bytes"))"
echo ""
echo "You can now use the MCP server:"
echo "  node src/ygo-search-card-server.js"
echo ""
