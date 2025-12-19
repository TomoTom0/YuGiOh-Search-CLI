#!/bin/bash
# Setup script to download card data files for YGO MCP Server

set -e

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "Error: curl is not installed. Please install curl first."
    exit 1
fi

# Check if tar is available
if ! command -v tar &> /dev/null; then
    echo "Error: tar is not installed. Please install tar first."
    exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install jq first."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../../data"
SCRAPING_REPO="TomoTom0/YuGiOh-Scraping"
API_URL="https://api.github.com/repos/$SCRAPING_REPO/releases"

# Map: detected_type -> target_filename
declare -A OUTPUT_FILES
OUTPUT_FILES[cards]=cards-all.tsv
OUTPUT_FILES[details]=detail-all.tsv
OUTPUT_FILES[faq]=faq-all.tsv

# Exact filename match patterns
declare -A EXACT_FILENAMES
EXACT_FILENAMES[cards]="cards-all.tsv"
EXACT_FILENAMES[details]="details-all.tsv"
EXACT_FILENAMES[faq]="faq-all.tsv"

# Column keywords for scoring (space-separated, case-insensitive)
declare -A COLUMN_KEYWORDS
COLUMN_KEYWORDS[cards]="cardType ruby text cardId monsterTypes"
COLUMN_KEYWORDS[details]="supplementInfo pendulum cardName supplementDate"
COLUMN_KEYWORDS[faq]="question answer faqId updatedAt"

# Function to get the latest release download URL
get_latest_release_url() {
  echo "Fetching latest release from GitHub..." >&2
  local response=$(curl -s "$API_URL")

  local download_url=$(echo "$response" | jq -r '.[0].assets[] | select(.name | endswith(".tar.gz")) | .browser_download_url' | head -1)

  if [ -z "$download_url" ] || [ "$download_url" = "null" ]; then
    echo "Error: Could not find tar.gz file in latest release" >&2
    exit 1
  fi

  echo "$download_url"
}

# Function to detect file type by examining header columns
detect_file_type() {
  local filepath="$1"
  local filename=$(basename "$filepath")

  # Check for exact filename match first
  for type in "${!EXACT_FILENAMES[@]}"; do
    if [ "$filename" = "${EXACT_FILENAMES[$type]}" ]; then
      echo "$type"
      return 0
    fi
  done

  # Get header line and convert to lowercase for comparison
  local header=$(head -1 "$filepath" | tr '\t' '\n' | tr '[:upper:]' '[:lower:]' | tr '\n' ' ')

  # Score each file type based on column keyword matches
  declare -A scores
  local best_type=""
  local best_score=0

  for type in "${!COLUMN_KEYWORDS[@]}"; do
    local score=0
    local keywords="${COLUMN_KEYWORDS[$type]}"

    # Count matching keywords (case-insensitive)
    for keyword in $keywords; do
      keyword_lower=$(echo "$keyword" | tr '[:upper:]' '[:lower:]')
      if [[ " $header " == *" $keyword_lower "* ]]; then
        ((score++))
      fi
    done

    scores[$type]=$score

    # Update best match
    if [ $score -gt $best_score ]; then
      best_score=$score
      best_type="$type"
    fi
  done

  # Require at least one keyword match
  if [ $best_score -lt 1 ]; then
    echo "Error: Could not determine file type for $filename (no matching keywords)" >&2
    return 1
  fi

  echo "$best_type"
  return 0
}

# Function to verify file size
verify_file_size() {
  local filename="$1"
  local filepath="$DATA_DIR/$filename"
  local MIN_SIZE=1000000

  local filesize=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath" 2>/dev/null)

  if [ "$filesize" -lt $MIN_SIZE ]; then
    echo "Error: Extracted file is too small"
    echo "$filename: $filesize bytes (expected at least $MIN_SIZE bytes)"
    rm -f "$filepath"
    exit 1
  fi

  echo "$filesize"
}

echo "=== YGO MCP Server - Data Setup ==="
echo ""
echo "Downloading card data files from YuGiOh-Scraping repository..."
echo ""

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Get latest release download URL
DOWNLOAD_URL=$(get_latest_release_url)
echo "Download URL: $DOWNLOAD_URL"
echo ""

# Download and extract tar.gz
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

TAR_FILE="$TEMP_DIR/ygo-data.tar.gz"
echo "Downloading tar.gz file..."
curl -L -f -s -o "$TAR_FILE" "$DOWNLOAD_URL"

if [ ! -f "$TAR_FILE" ]; then
  echo "Error: Failed to download tar.gz"
  exit 1
fi

echo "Extracting tar.gz file..."
tar -xzf "$TAR_FILE" -C "$TEMP_DIR"

# Detect and copy data files
echo "Detecting and copying data files..."
declare -a DETECTED_TYPES
declare -A DETECTED_FILES

# Find all TSV files in the extracted directory
while IFS= read -r tsv_file; do
  if file_type=$(detect_file_type "$tsv_file"); then
    if [[ " ${DETECTED_TYPES[@]} " =~ " ${file_type} " ]]; then
      echo "Error: Duplicate file type detected: $file_type"
      echo "Files: $tsv_file and ${DETECTED_FILES[$file_type]}"
      exit 1
    fi

    DETECTED_TYPES+=("$file_type")
    DETECTED_FILES[$file_type]="$tsv_file"
    echo "  - Detected $file_type: $(basename "$tsv_file")"
  fi
done < <(find "$TEMP_DIR" -type f -name "*.tsv")

# Verify all required files were detected
echo ""
echo "Verifying all required files were detected..."
for required_type in "${!EXPECTED_HEADERS[@]}"; do
  if [ -z "${DETECTED_FILES[$required_type]}" ]; then
    echo "Error: Missing required file type: $required_type (header: ${EXPECTED_HEADERS[$required_type]})"
    exit 1
  fi
done

# Copy detected files to data directory
echo "Copying files to data directory..."
for file_type in "${!DETECTED_FILES[@]}"; do
  source_file="${DETECTED_FILES[$file_type]}"
  target_name="${OUTPUT_FILES[$file_type]}"
  target_file="$DATA_DIR/$target_name"

  cp "$source_file" "$target_file"
  echo "  - $source_file -> $target_name"
done

# Verify file sizes
echo ""
echo "Verifying file sizes..."
for file_type in "${!OUTPUT_FILES[@]}"; do
  verify_file_size "${OUTPUT_FILES[$file_type]}" > /dev/null
done

echo ""
echo "Data files downloaded and extracted successfully!"
echo ""
echo "Files location:"
for file_type in "${!OUTPUT_FILES[@]}"; do
  filename="${OUTPUT_FILES[$file_type]}"
  filepath="$DATA_DIR/$filename"
  filesize=$(stat -f%z "$filepath" 2>/dev/null || stat -c%s "$filepath" 2>/dev/null)
  formatted_size=$(numfmt --to=iec-i --suffix=B $filesize 2>/dev/null || echo "$filesize bytes")
  echo "  - $filepath ($formatted_size)"
done
echo ""
echo "You can now use the MCP server:"
echo "  node dist/ygo-search-card-server.js"
echo ""
