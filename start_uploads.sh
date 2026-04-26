#!/bin/bash

# =====================================================
# R2 Upload Starter Script
# =====================================================
# This script prompts for API token and starts uploads

cd /Users/hiro/Desktop/音楽フリーBGMサイト

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║      Cloudflare R2 - Upload Starter            ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Check if token already set
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
    echo "✅ CLOUDFLARE_API_TOKEN is already set (${#CLOUDFLARE_API_TOKEN} chars)"
    echo ""
    read -p "Use this token? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        unset CLOUDFLARE_API_TOKEN
    fi
fi

# Get token if not set
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "📌 Get your API token from:"
    echo "   https://dash.cloudflare.com/profile/api-tokens"
    echo ""
    read -s -p "Paste your CLOUDFLARE_API_TOKEN here: " token
    echo ""
    
    if [ -z "$token" ]; then
        echo "❌ No token provided. Exiting."
        exit 1
    fi
    
    export CLOUDFLARE_API_TOKEN="$token"
fi

# Verify token works
echo ""
echo "🔍 Verifying token..."
if npm exec -- wrangler r2 bucket list >/dev/null 2>&1; then
    echo "✅ Token verified successfully"
else
    echo "❌ Token verification failed. Please check your token."
    exit 1
fi

# Start uploads
echo ""
echo "🚀 Starting R2 uploads..."
./resume_uploads.sh

