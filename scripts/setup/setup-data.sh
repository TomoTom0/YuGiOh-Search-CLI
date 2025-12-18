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
VERSION="${1:-v1.3.0}"

# Data files to download
declare -a DATA_FILES=("cards-all.tsv" "detail-all.tsv" "faq-all.tsv")

# Function to download a file
download_file() {
  local filename="$1"
  local filepath="$DATA_DIR/$filename"

  echo "Downloading $filename..."
  HTTP_CODE=$(curl -L -w "%{http_code}" -o "$filepath" -sS \
    "$RELEASE_URL/$VERSION/$filename" 2>&1 | tail -n 1)

  if [ "$HTTP_CODE" != "200" ]; then
    echo "Error: Failed to download $filename (HTTP $HTTP_CODE)"
    echo "URL: $RELEASE_URL/$VERSION/$filename"
    echo ""
    echo "Possible reasons:"
    echo "  - Version '$VERSION' does not exist"
    echo "  - Release does not have $filename attached"
    echo "  - Network issue"
    echo ""
    echo "Available versions: https://github.com/TomoTom0/ygo-db-local-mcp/releases"
    rm -f "$filepath"
    exit 1
  fi
}

# Function to verify file size
verify_file_size() {
  local filename="$1"
  local filepath="$DATA_DIR/$filename"
  local MIN_SIZE=1000000

  local filesize=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath" 2>/dev/null)

  if [ "$filesize" -lt $MIN_SIZE ]; then
    echo "Error: Downloaded file is too small (possibly error page)"
    echo "$filename: $filesize bytes (expected at least $MIN_SIZE bytes)"
    rm -f "$filepath"
    exit 1
  fi

  echo "$filesize"
}

echo "=== YGO MCP Server - Data Setup ==="
echo ""
echo "Downloading card data files from GitHub Releases..."
echo "Version: $VERSION"
echo ""

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Download all data files
for filename in "${DATA_FILES[@]}"; do
  download_file "$filename"
done

# Verify file sizes
echo ""
echo "Verifying file sizes..."
declare -A FILE_SIZES
for filename in "${DATA_FILES[@]}"; do
  FILE_SIZES[$filename]=$(verify_file_size "$filename")
done

echo ""
echo "Data files downloaded successfully!"
echo ""
echo "Files location:"
for filename in "${DATA_FILES[@]}"; do
  filesize=${FILE_SIZES[$filename]}
  formatted_size=$(numfmt --to=iec-i --suffix=B $filesize 2>/dev/null || echo "$filesize bytes")
  echo "  - $DATA_DIR/$filename ($formatted_size)"
done
echo ""
echo "You can now use the MCP server:"
echo "  node dist/ygo-search-card-server.js"
echo ""
