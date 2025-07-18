# RegAV AI Scalping Bot

A high-frequency cryptocurrency trading bot built for the Recall Hackathon that features advanced AI-powered market analysis, automated trading execution, and comprehensive risk management.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials

# Start the trading bot
npm run start:recall
```

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Sponsor Technology Integration](#sponsor-technology-integration)
- [API Reference](#api-reference)
- [Development](#development)
- [Risk Management](#risk-management)
- [Performance Monitoring](#performance-monitoring)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

RegAV AI is an automated trading agent designed for high-frequency cryptocurrency trading. It combines AI analysis with robust risk management to execute profitable trades in volatile market conditions.

### Key Capabilities

- **High-Frequency Trading**: Execute trades in milliseconds with scalping strategies
- **AI-Powered Analysis**: Leverages Gaia's decentralized AI for market sentiment and technical analysis
- **Policy-Based Trading**: Uses Vincent's programmable policy engine for permissions, trading tools, and policies
- **Decentralized Storage**: Stores trading data and analytics on Recall's decentralized network
- **Multi-Timeframe Analysis**: Analyzes market conditions across multiple timeframes (1s, 5s, 15s, 1m, 5m)
- **Advanced Risk Management**: Comprehensive risk controls with real-time monitoring and circuit breakers

## ✨ Features

### 🤖 AI-Powered Trading
- **Sentiment Analysis**: Real-time market sentiment analysis using Gaia AI
- **Technical Indicators**: Multi-timeframe RSI, MACD, Bollinger Bands, and custom scalping indicators
- **Pattern Recognition**: Advanced pattern detection for entry and exit signals
- **Market Regime Detection**: Automatically adapts strategy based on market conditions

### 🔒 Security & Risk Management
- **Policy-Based Execution**: Vincent policies enforce trading rules and risk limits
- **Real-time Risk Monitoring**: Continuous monitoring of position sizes, drawdowns, and exposure
- **Circuit Breakers**: Automatic trading halts on excessive losses or system errors
- **Dynamic Position Sizing**: Adjusts position sizes based on volatility and confidence levels

### 📊 Performance Monitoring
- **Real-time Metrics**: Live tracking of P&L, win rates, and trading performance
- **Advanced Analytics**: Sharpe ratio, maximum drawdown, and profit factor calculations
- **Trade Logging**: Comprehensive logging of all trading decisions and outcomes

### 🌐 Decentralized Infrastructure
- **Recall Network**: Decentralized storage for trading data and analytics
- **Vincent Policies**: Programmable policies for automated trading governance
- **Gaia AI**: Decentralized AI network for market analysis and predictions

## 🏗️ Architecture

The bot follows a modular architecture with clear separation of concerns:

```
src/
├── index.js                    # Main application entry point
├── agent/                      # Core trading logic
│   ├── ScalpingAgent.js        # Main trading orchestrator
│   ├── TradingStrategy.js      # Trading strategy implementation
│   └── RiskManager.js          # Risk management system
├── integrations/               # External service integrations
│   ├── RecallClient.js         # Recall network client
│   ├── VincentClient.js        # Vincent policy engine client
│   ├── VincentConsentManager.js # Vincent consent management
│   └── Gaia.Client.js          # Gaia AI client
├── vincent/                    # Vincent policy framework
│   ├── BundledVincentTools.js  # Vincent tools and policies
│   ├── policies/               # Trading policies
│   └── tools/                  # Trading tools
├── analytics/                  # Market analysis components
│   ├── MarketDataProcessor.js  # Market data processing
│   ├── SentimentAnalyzer.js    # Sentiment analysis
│   └── TechnicalIndicators.js  # Technical analysis
├── utils/                      # Utility functions
│   ├── Logger.js               # Logging system
│   ├── Config.js               # Configuration management
│   └── Validator.js            # Input validation
└── configs/                    # Configuration files
    ├── trading.json            # Trading parameters
    ├── indicators.json         # Technical indicators config
    └── networks.json           # Network configurations
```

## 🛠️ Installation

### Prerequisites

- Node.js 20.0.0 or higher
- npm 9.0.0 or higher
- Git

### Setup

1. **Clone the repository**:
```bash
git clone https://github.com/Zolldyk/RegavAI-01.git
cd RegavAI-01
```

2. **Install dependencies**:
```bash
npm install
```

3. **Environment Configuration**:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Recall Network Configuration
RECALL_PRIVATE_KEY=0x...
RECALL_NETWORK=testnet

# Vincent Configuration
VINCENT_APP_ID=983
VINCENT_APP_DELEGATEE_PRIVATE_KEY=0x...
VINCENT_PKP_TOKEN_ID=...

# Gaia AI Configuration
GAIA_API_KEY=your_gaia_api_key
GAIA_NODE_URL=https://llama8b.gaia.domains/v1

# Trading Parameters
BUY_THRESHOLD=0.1
SELL_THRESHOLD=-0.1
CONFIDENCE_THRESHOLD=0.2
MAX_CONCURRENT_TRADES=5
BASE_POSITION_SIZE=1000
STOP_LOSS_PERCENT=0.3
TAKE_PROFIT_PERCENT=0.5
```

4. **Verify Installation**:
```bash
npm run verify-account
```

## ⚙️ Configuration

### Trading Parameters

Configure trading behavior in `src/configs/trading.json`:

```json
{
  "trading": {
    "tradingPairs": ["BTC/USDT", "ETH/USDT", "SOL/USDC"],
    "maxConcurrentTrades": 5,
    "basePositionSize": 1000,
    "scalpingInterval": 2000
  },
  "riskManagement": {
    "maxDrawdownPercent": 3.0,
    "stopLossPercent": 0.3,
    "takeProfitPercent": 0.5,
    "positionSizeLimits": {
      "min": 50,
      "max": 5000
    }
  },
  "competition": {
    "targetTrades": 50,
    "profitTarget": 0.25,
    "maxLoss": 0.05
  }
}
```

### Technical Indicators

Configure indicators in `src/configs/indicators.json`:

```json
{
  "rsi": {
    "period": 14,
    "overbought": 70,
    "oversold": 30
  },
  "macd": {
    "fastPeriod": 12,
    "slowPeriod": 26,
    "signalPeriod": 9
  },
  "bollingerBands": {
    "period": 20,
    "standardDeviations": 2
  }
}
```

## 📚 Usage

### Basic Usage

1. **Start the bot**:
```bash
npm run start:recall
```

2. **Monitor performance**:
```bash
tail -f logs/application-$(date +%Y-%m-%d).log
```

3. **Stop the bot**:
```bash
# Graceful shutdown with Ctrl+C
# Or kill the process
```

### Development Mode

```bash
# Start with hot reload
npm run dev:recall

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Competition Mode

```bash
# Run in production competition mode
npm run competition


```

## 🎯 Sponsor Technology Integration

### Recall Network Integration

**Location**: `src/integrations/RecallClient.js`

The bot integrates with Recall's decentralized network for:

- **Data Storage**: Trading analytics, performance metrics, and trade history
- **Account Management**: Portfolio tracking and balance management
- **Trade Execution**: Direct integration with Recall's trading APIs
- **Competition Participation**: Automated competition registration and tracking

**Key Features**:
- Decentralized storage of trading data
- Real-time portfolio synchronization
- Competition leaderboard tracking
- Transparent trade execution logs

```javascript
// Example: Storing trading analytics
const bucket = await this.recallClient.getOrCreateBucket('trading_analytics');
await this.recallClient.addObject(bucket.bucket, 'trade_analysis', analyticsData);
```

### Vincent Policy Engine Integration

**Location**: `src/integrations/VincentClient.js`, `src/vincent/`

Vincent provides programmable policies for secure automated trading:

- **Policy Enforcement**: Automated enforcement of trading rules and risk limits
- **Consent Management**: Secure user consent for automated trading operations
- **Tool Integration**: Custom trading tools with policy-based execution
- **Risk Controls**: Programmable risk management policies

**Key Components**:
- **Trade Amount Limit Policy**: Restricts individual trade amounts
- **Trade Expiry Policy**: Ensures trades expire after specified time
- **Token Allowlist Policy**: Restricts trading to approved tokens
- **ERC20 Trading Tool**: Secure token trading with policy enforcement

```javascript
// Example: Executing trade with Vincent policies
const result = await this.vincentClient.executeTradeWithPolicies({
  pair: 'BTC/USDT',
  action: 'BUY',
  amount: 0.001,
  policies: ['trade-amount-limit', 'trade-expiry', 'token-allowlist']
});
```

### Gaia AI Integration

**Location**: `src/integrations/Gaia.Client.js`

Gaia provides decentralized AI for market analysis:

- **Market Analysis**: Comprehensive market condition analysis
- **Sentiment Analysis**: Real-time sentiment tracking across social media and news
- **Risk Assessment**: AI-powered risk evaluation and position sizing
- **Arbitrage Detection**: Cross-exchange and cross-chain arbitrage opportunities

**Key Features**:
- Multi-timeframe market analysis
- Sentiment momentum tracking
- Dynamic risk assessment
- Arbitrage opportunity detection

```javascript
// Example: Getting AI market analysis
const analysis = await this.gaiaClient.getMarketAnalysis(['BTC/USDT', 'ETH/USDT'], {
  volatility: 'high',
  trend: 'bullish',
  volume: 1500000
});
```

## 🔧 API Reference

### ScalpingAgent

Main trading orchestrator that coordinates all components.

#### Methods

- `initialize()`: Initialize all components and connections
- `start()`: Start the trading competition
- `stop()`: Gracefully stop the trading bot
- `getStatus()`: Get current agent status and metrics

### TradingStrategy

Implements the core trading logic and strategy.

#### Methods

- `analyzeMarket(marketData)`: Analyze market conditions
- `start()`: Start the trading strategy
- `stop()`: Stop the trading strategy
- `getEnhancedStatus()`: Get detailed strategy status

### RiskManager

Manages risk controls and position sizing.

#### Methods

- `checkRisk(tradeParams)`: Evaluate trade risk
- `updatePositions(positions)`: Update position tracking
- `getRiskStatus()`: Get current risk metrics

## 🔄 Development

### Project Structure

```
regav-ai/
├── src/                    # Source code
├── api/                    # API endpoints
├── logs/                   # Log files
├── scripts/                # Utility scripts
├── public/                 # Static files
├── .env                    # Environment variables
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

### Scripts

- `npm start`: Start the main application
- `npm run start:recall`: Start with Recall integration
- `npm run dev`: Development mode with hot reload
- `npm run test`: Run test suite
- `npm run lint`: Run ESLint
- `npm run format`: Format code with Prettier
- `npm run deploy`: Deploy to production

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `RECALL_PRIVATE_KEY` | Private key for Recall network | Yes |
| `VINCENT_APP_ID` | Vincent application ID | Yes |
| `VINCENT_APP_DELEGATEE_PRIVATE_KEY` | Vincent delegatee private key | Yes |
| `GAIA_API_KEY` | Gaia AI API key | Yes |
| `BUY_THRESHOLD` | Buy signal threshold | No |
| `SELL_THRESHOLD` | Sell signal threshold | No |
| `MAX_CONCURRENT_TRADES` | Maximum concurrent trades | No |

## ⚠️ Risk Management

### Built-in Risk Controls

1. **Position Sizing**: Dynamic position sizing based on volatility and confidence
2. **Stop Loss**: Automatic stop loss orders on all positions
3. **Take Profit**: Automatic take profit orders
4. **Drawdown Limits**: Maximum portfolio drawdown protection
5. **Circuit Breakers**: Automatic trading halt on system errors

### Risk Monitoring

- Real-time portfolio monitoring
- Continuous risk metric calculation
- Automated alerts for risk threshold breaches
- Emergency stop mechanisms

### Safety Features

- **Sandbox Mode**: Test trading strategies without real money
- **Paper Trading**: Simulate trades for strategy validation
- **Gradual Scaling**: Start with small positions and scale up
- **Manual Override**: Ability to manually stop or override the bot

## 📈 Performance Monitoring

### Metrics Tracked

- **P&L**: Real-time profit and loss tracking
- **Win Rate**: Percentage of profitable trades
- **Sharpe Ratio**: Risk-adjusted returns
- **Maximum Drawdown**: Largest portfolio decline
- **Trade Frequency**: Trades per hour/minute
- **Execution Time**: Average trade execution time

### Logging

All trading activities are logged with different levels:

- **Info**: General trading activities
- **Warn**: Risk warnings and alerts
- **Error**: System errors and failures
- **Debug**: Detailed debugging information

### Performance Reports

The bot generates comprehensive performance reports including:

- Trade-by-trade analysis
- Risk metrics
- Strategy performance
- Market condition analysis

## 🛡️ Security

### Best Practices

1. **Private Key Management**: Never expose private keys in code
2. **Environment Variables**: Use `.env` files for sensitive data
3. **Policy Enforcement**: Vincent policies provide additional security layers
4. **Audit Logging**: All actions are logged for audit purposes
5. **Rate Limiting**: Built-in rate limiting for API calls

### Security Features

- **Vincent Consent**: Secure user consent for automated trading
- **Policy Enforcement**: Automated enforcement of trading rules
- **Risk Controls**: Multiple layers of risk management
- **Audit Trail**: Complete audit trail of all trading activities


## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Recall Network**: For providing decentralized storage and trading infrastructure
- **Vincent**: For programmable policy engine and security framework
- **Gaia**: For decentralized AI network and market analysis capabilities
- **Hackathon Organizers**: For providing the platform to showcase this project


---
