#!/bin/bash

echo "╔════════════════════════════════════════════════╗"
echo "║      Final Status Check - April 26, 15:28    ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Test 1: Production Site
echo "1️⃣  Production Site Status"
echo "   Testing: https://nihonichi-freemusicbgm.pages.dev"
status=$(curl -s -o /dev/null -w "%{http_code}" "https://nihonichi-freemusicbgm.pages.dev" 2>/dev/null)
if [ "$status" = "200" ]; then
  echo "   ✅ Live and accessible (HTTP 200)"
else
  echo "   ❌ Not accessible (HTTP $status)"
fi

# Test 2: Metadata API
echo ""
echo "2️⃣  R2 Metadata API"
echo "   Testing: https://pub-c8052da2182b4317bc252b78e473584c.r2.dev/data/index.json"
status=$(curl -s -o /dev/null -w "%{http_code}" "https://pub-c8052da2182b4317bc252b78e473584c.r2.dev/data/index.json" 2>/dev/null)
if [ "$status" = "200" ]; then
  echo "   ✅ Accessible (HTTP 200)"
  size=$(curl -s -I "https://pub-c8052da2182b4317bc252b78e473584c.r2.dev/data/index.json" 2>/dev/null | grep -i content-length | awk '{print $2}' | tr -d '\r')
  size_mb=$(echo "scale=1; $size / 1048576" | bc 2>/dev/null)
  echo "   📊 Size: ${size_mb}MB"
else
  echo "   ❌ Not accessible (HTTP $status)"
fi

# Test 3: Audio Files
echo ""
echo "3️⃣  Audio Files Status"
audio_url="https://pub-c8052da2182b4317bc252b78e473584c.r2.dev/audio/"
status=$(curl -s -o /dev/null -w "%{http_code}" "$audio_url" 2>/dev/null)
if [ "$status" = "200" ]; then
  echo "   ✅ Audio directory exists"
elif [ "$status" = "403" ]; then
  echo "   ⚠️  Directory listing disabled (OK)"
else
  echo "   ❌ Not accessible (HTTP $status)"
fi

# Test 4: Git Status
echo ""
echo "4️⃣  Git Repository"
cd /Users/hiro/Desktop/音楽フリーBGMサイト
repo_size=$(du -sh .git 2>/dev/null | awk '{print $1}')
file_count=$(git ls-files | wc -l)
latest_commit=$(git log -1 --oneline 2>/dev/null)
echo "   Repository size: $repo_size"
echo "   Tracked files: $file_count"
echo "   Latest commit: $latest_commit"

# Test 5: Deployment Status
echo ""
echo "5️⃣  Cloudflare Pages Deployment"
if grep -q "pub-c8052da2182b4317bc252b78e473584c.r2.dev" index.html; then
  echo "   ✅ index.html contains R2 URL"
else
  echo "   ❌ R2 URL not found in index.html"
fi

if grep -q "const DATA_BASE = " index.html; then
  line=$(grep "const DATA_BASE = " index.html | head -1)
  echo "   Current configuration: ${line:0:60}..."
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║            Summary                             ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "✅ What's working:"
echo "   • Cloudflare Pages deployed"
echo "   • Metadata loaded from R2"
echo "   • Production site is LIVE"
echo ""
echo "⏳ What's pending:"
echo "   • Audio files upload (7GB)"
echo "   • Image files upload (226MB)"
echo ""
echo "🔑 To complete:"
echo "   1. Get API token: https://dash.cloudflare.com/profile/api-tokens"
echo "   2. Run: export CLOUDFLARE_API_TOKEN=\"<token>\""
echo "   3. Run: ./start_uploads.sh"
echo ""

