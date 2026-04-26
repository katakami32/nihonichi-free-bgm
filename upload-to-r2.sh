#!/bin/bash

# R2 データアップロードスクリプト
# 使用方法: CLOUDFLARE_API_TOKEN="your-token" ./upload-to-r2.sh

set -e  # Exit on error

# Check for API token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ Error: CLOUDFLARE_API_TOKEN environment variable not set"
  echo "Please set the token before running:"
  echo "  export CLOUDFLARE_API_TOKEN=\"your-api-token\""
  echo "  ./upload-to-r2.sh"
  exit 1
fi

echo "🚀 Starting R2 data upload..."
echo "Account: dec079cbb6f80e5bf626941e3f83844b"
echo "Bucket: bgm-data"
echo ""

# Upload metadata
echo "📄 Uploading metadata files..."
npx wrangler r2 object put bgm-data/data/index.json --file ./data/index.json
npx wrangler r2 object put bgm-data/data/genres.json --file ./data/genres.json
echo "✅ Metadata uploaded"
echo ""

# Upload audio files (large, might take 30-60 minutes)
echo "🎵 Uploading audio files (this may take 30-60 minutes)..."
npx wrangler r2 object put bgm-data/audio/ --local-dir ./audio --recursive
echo "✅ Audio files uploaded"
echo ""

# Upload images
echo "🖼️  Uploading image files..."
npx wrangler r2 object put bgm-data/images/ --local-dir ./images --recursive
echo "✅ Image files uploaded"
echo ""

# Verify upload
echo "🔍 Verifying upload..."
echo "Data files in R2:"
npx wrangler r2 object list bgm-data/data/
echo ""
echo "Sample audio files (first 5):"
npx wrangler r2 object list bgm-data/audio/ | head -5
echo ""
echo "Image files:"
npx wrangler r2 object list bgm-data/images/
echo ""

echo "✅ All files uploaded successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Test locally: python3 -m http.server 8000"
echo "2. Open http://localhost:8000 and verify songs load from /data/"
echo "3. Git push should have completed, check GitHub:"
echo "   https://github.com/katakami32/nihonichi-free-bgm"
echo "4. Production should auto-deploy to:"
echo "   https://nihonichi-freemusicbgm.pages.dev"
echo "5. Verify production loads from R2 (check Network tab in DevTools)"
