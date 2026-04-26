#!/bin/bash

set -e

PROJECT_DIR="/Users/hiro/Desktop/音楽フリーBGMサイト"
cd "$PROJECT_DIR"

echo "╔════════════════════════════════════════════════╗"
echo "║     R2 Upload Resume & Progress Monitor        ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "Started: $(date)"
echo ""

# Counter for uploads
SUCCESS=0
FAILED=0
SKIPPED=0

# Function to upload a file
upload_file() {
  local source=$1
  local target=$2
  
  if [ ! -f "$source" ]; then
    echo "⚠️  SKIP: File not found: $source"
    ((SKIPPED++))
    return
  fi
  
  # Show progress
  local size=$(stat -f%z "$source" 2>/dev/null || echo "?")
  echo -n "📤 Uploading: $target ... "
  
  if npm exec -- wrangler r2 object put "$target" --file "$source" --remote >/dev/null 2>&1; then
    echo "✅"
    ((SUCCESS++))
  else
    echo "❌"
    ((FAILED++))
  fi
}

# ==============================================================================
# PHASE 1: Data Files (metadata JSON)
# ==============================================================================
echo "═ PHASE 1: Upload Metadata Files ═"
echo ""

upload_file "./data/index.json" "bgm-data/data/index.json"
upload_file "./data/genres.json" "bgm-data/data/genres.json"

# Upload by-genre files if they exist
for file in ./data/by-genre/*.json 2>/dev/null; do
  if [ -f "$file" ]; then
    filename=$(basename "$file")
    upload_file "$file" "bgm-data/data/by-genre/$filename"
  fi
done

echo ""
echo "Phase 1 Summary: $SUCCESS uploaded, $FAILED failed, $SKIPPED skipped"
echo ""

# ==============================================================================
# PHASE 2: Audio Files (BGM)
# ==============================================================================
echo "═ PHASE 2: Upload Audio Files (2,072 files) ═"
echo "   This will take 30-120 minutes depending on network speed"
echo ""

# Use batch upload with --recursive for efficiency
if [ -d "./audio" ]; then
  echo "📤 Starting batch upload of ./audio/ directory..."
  echo ""
  
  if npm exec -- wrangler r2 object put bgm-data/audio --local-dir ./audio --recursive --remote; then
    echo "✅ Audio batch upload completed"
    ((SUCCESS++))
  else
    echo "⚠️  Audio batch upload may have encountered errors (some files may have uploaded)"
  fi
else
  echo "❌ Audio directory not found"
fi

echo ""

# ==============================================================================
# PHASE 3: Image Files
# ==============================================================================
echo "═ PHASE 3: Upload Image Files (2,070 files) ═"
echo ""

if [ -d "./images" ]; then
  echo "📤 Starting batch upload of ./images/ directory..."
  echo ""
  
  if npm exec -- wrangler r2 object put bgm-data/images --local-dir ./images --recursive --remote; then
    echo "✅ Image batch upload completed"
    ((SUCCESS++))
  else
    echo "⚠️  Image batch upload may have encountered errors (some files may have uploaded)"
  fi
else
  echo "❌ Image directory not found"
fi

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║            Upload Process Complete             ║"
echo "╚════════════════════════════════════════════════╝"
echo "Completed: $(date)"
echo ""
echo "📊 Summary:"
echo "   ✅ Successful: $SUCCESS"
echo "   ❌ Failed: $FAILED"
echo "   ⏭️  Skipped: $SKIPPED"
echo ""
echo "💡 Next Steps:"
echo "   1. Wait a few moments for CDN cache to clear"
echo "   2. Test production site: https://nihonichi-freemusicbgm.pages.dev"
echo "   3. Test localhost: python3 -m http.server 8000"
echo "   4. Check DevTools Network tab for R2 URLs"
echo ""

