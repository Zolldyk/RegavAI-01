#!/bin/bash

# Regav Trading Agent - Competition Starter
echo "🚀 Starting Regav Trading Agent for LIVE COMPETITION"
echo "======================================================"

# Check if competition ID is provided
if [ "$1" = "" ]; then
    echo "❌ Error: Please provide competition ID"
    echo "Usage: ./start-competition.sh <COMPETITION_ID>"
    echo "Example: ./start-competition.sh comp-2025-07-14-1hr"
    exit 1
fi

COMPETITION_ID=$1

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Set up production environment
echo "🔧 Setting up production environment..."
sed -i '' "s/RECALL_NETWORK=.*/RECALL_NETWORK=mainnet/" .env
sed -i '' "s/RECALL_API_BASE_URL=.*/RECALL_API_BASE_URL=https:\/\/api.competitions.recall.network/" .env
sed -i '' "s/RECALL_COMPETITION_ID=.*/RECALL_COMPETITION_ID=$COMPETITION_ID/" .env
sed -i '' "s/NODE_ENV=.*/NODE_ENV=production/" .env
sed -i '' "s/MOCK_TRADING=.*/MOCK_TRADING=false/" .env
sed -i '' "s/PAPER_TRADING=.*/PAPER_TRADING=false/" .env

echo "✅ Environment configured for competition: $COMPETITION_ID"
echo "💰 Portfolio: ~$31,558 available"
echo "⚡ Config: 0.35 signal threshold, 12 concurrent trades"
echo "🎯 Target: 80 trades/hour, 8% profit"

echo ""
echo "🚨 STARTING LIVE TRADING IN 10 SECONDS..."
echo "🚨 Press Ctrl+C to cancel"
sleep 10

# Start the trading agent
echo "🚀 LIVE TRADING STARTED!"
node test-full-trading-agent-clean.js 60