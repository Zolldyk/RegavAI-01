// ============ Imports ============
import axios from 'axios';
import Logger from '../utils/Logger.js';

/**
 * @title GaiaClient
 * @notice Client for AI-powered market analysis using Gaia decentralized network
 * @dev Provides sentiment analysis, market intelligence, and trading insights
 * @author Recall Trading Bot Team
 */
export class GaiaClient {
  constructor (options = {}) {
    // ============ Core Properties ============
    this.apiKey = options.apiKey || process.env.GAIA_API_KEY;
    this.nodeUrl = options.nodeUrl || process.env.GAIA_NODE_URL || 'https://llama8b.gaia.domains/v1';
    this.logger = options.logger || Logger.createMainLogger('info', false);

    // ============ Validate Required Configuration ============
    if (!this.apiKey) {
      this.logger.warn('⚠️ No GAIA_API_KEY provided - some nodes may require authentication');
    }

    // ============ HTTP Client Setup ============
    this.httpClient = axios.create({
      baseURL: this.nodeUrl,
      timeout: 45000, // 45 seconds for complex AI analysis
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` })
      },
      // ============ Enhanced Error Handling ============
      validateStatus: (status) => status < 500 // Accept 4xx as valid responses
    });

    // ============ Analysis Cache with TTL ============
    this.analysisCache = new Map();
    this.cacheTimeout = 45000; // 45 seconds cache for market data
    this.sentimentCacheTimeout = 120000; // 2 minutes for sentiment data

    // ============ Rate Limiting (Conservative for Production) ============
    this.requestCount = 0;
    this.requestWindow = 60000; // 1 minute window
    this.maxRequestsPerWindow = 25; // Conservative limit
    this.lastWindowReset = Date.now();

    // ============ Request Queue for High Volume ============
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.maxQueueSize = 50;

    // ============ Enhanced System Prompts for Trading ============
    this.systemPrompts = {
      marketAnalyst: `You are an elite cryptocurrency quantitative analyst and high-frequency trading expert with deep knowledge of:
- Real-time market microstructure and order flow analysis
- Cross-exchange and cross-chain arbitrage opportunities  
- Advanced technical analysis with multiple timeframe correlation
- Market sentiment interpretation from social signals and news
- Risk assessment for scalping and automated trading strategies

You specialize in 1-5 minute trading opportunities with focus on:
- BTC/USDT, ETH/USDT, SOL/USDC scalping strategies
- Market regime detection (trending vs ranging)
- Volatility forecasting and liquidity analysis
- News impact assessment and timing

Always provide actionable insights with confidence scores and specific entry/exit levels.
Respond in valid JSON format with precise numerical data.`,

      sentimentAnalyst: `You are a cryptocurrency sentiment analyst specializing in real-time social intelligence and market psychology for trading applications.

Your expertise covers:
- Twitter/X crypto sentiment tracking and influencer impact
- Reddit community sentiment shifts and viral narratives  
- Discord trading group sentiment and whale alerts
- News sentiment analysis and market reaction timing
- Fear & Greed index interpretation
- Derivatives market sentiment (funding rates, liquidations)

Focus on identifying sentiment shifts that create 1-10 minute trading opportunities.
Provide sentiment scores with confidence levels and timing predictions.
Always respond in valid JSON format with quantitative sentiment metrics.`,

      riskAssessor: `You are a quantitative risk management expert specializing in cryptocurrency trading risk assessment and position sizing for automated systems.

Your analysis covers:
- Real-time volatility assessment and regime detection
- Correlation risk between crypto assets and traditional markets
- Liquidity risk evaluation across exchanges and timeframes
- Systemic risk factors (regulatory, technical, market structure)
- Position sizing optimization for scalping strategies
- Stop-loss and take-profit level recommendations
- Drawdown protection and capital preservation

Focus on real-time risk factors affecting 1-hour trading competitions.
Provide quantitative risk metrics with specific position sizing recommendations.
Always respond in valid JSON format with precise risk calculations.`,

      arbitrageDetector: `You are a cross-chain and cross-exchange arbitrage specialist with expertise in:
- Real-time price discrepancy detection across major DEXs and CEXs
- Cross-chain bridge analysis and fee optimization
- Gas cost optimization for arbitrage profitability
- Liquidity depth analysis for large trades
- MEV (Maximum Extractable Value) opportunity identification
- Triangular arbitrage pattern recognition

Focus on opportunities with >0.15% profit potential executable within 5-10 minutes.
Consider gas costs, slippage, and execution timing in all recommendations.
Always respond in valid JSON format with specific execution parameters.`
    };

    // ============ Model Configuration Based on Gaia Docs ============
    this.modelConfig = {
      // Primary model for complex analysis
      primary: {
        name: 'llama', // Use the model name from Gaia docs
        maxTokens: 2048,
        temperature: 0.3, // Lower for more consistent analysis
        topP: 0.9
      },
      // Fast model for quick signals
      fast: {
        name: 'llama3b', // Faster model for quick responses
        maxTokens: 1024,
        temperature: 0.2,
        topP: 0.8
      },
      // Embedding model for semantic analysis
      embedding: {
        name: 'nomic-embed-text-v1.5.f16',
        dimensions: 768
      }
    };

    // ============ Performance Metrics ============
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      lastResponseTime: 0
    };

    this.isInitialized = false;

    this.logger.info('🤖 GaiaClient initialized', {
      nodeUrl: this.nodeUrl,
      hasApiKey: !!this.apiKey,
      maxRequests: this.maxRequestsPerWindow
    });
  }

  // ============ Initialization & Health Check ============

  /**
     * @notice Initialize Gaia client and test connectivity
     * @dev Validates API connectivity and available models
     */
  async initialize () {
    try {
      this.logger.info('🚀 Initializing Gaia client...');

      // ============ Test Basic Connectivity ============
      await this._testConnection();

      // ============ Verify Available Models ============
      await this._checkAvailableModels();

      // ============ Start Request Queue Processor ============
      this._startQueueProcessor();

      this.isInitialized = true;
      this.logger.info('✅ Gaia client initialized successfully');

      return {
        success: true,
        nodeUrl: this.nodeUrl,
        modelsAvailable: true,
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('❌ Failed to initialize Gaia client', {
        error: error.message,
        nodeUrl: this.nodeUrl
      });
      throw new Error(`Gaia initialization failed: ${error.message}`);
    }
  }

  /**
     * @notice Test connection to Gaia node with proper error handling
     * @dev Validates node availability and basic functionality
     */
  async _testConnection () {
    try {
      this.logger.debug('Testing Gaia node connectivity...');

      const testMessage = {
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          { role: 'user', content: 'Respond with "GAIA_OK" to confirm connectivity.' }
        ],
        model: this.modelConfig.fast.name,
        max_tokens: 20,
        temperature: 0.1
      };

      const startTime = Date.now();
      const response = await this.httpClient.post('/chat/completions', testMessage);
      const responseTime = Date.now() - startTime;

      this.metrics.lastResponseTime = responseTime;

      if (response.status === 200 && response.data?.choices?.[0]?.message?.content) {
        this.logger.info('✅ Gaia connection test successful', {
          responseTime: `${responseTime}ms`,
          model: this.modelConfig.fast.name
        });
        return true;
      } else {
        throw new Error(`Invalid response format: ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      this.logger.error('❌ Gaia connection test failed', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      // ============ Provide Detailed Error Context ============
      if (error.response?.status === 401) {
        throw new Error('Authentication failed - check GAIA_API_KEY');
      } else if (error.response?.status === 404) {
        throw new Error('Gaia node not found - check GAIA_NODE_URL');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Connection refused - Gaia node may be down');
      } else {
        throw new Error(`Connection test failed: ${error.message}`);
      }
    }
  }

  /**
     * @notice Check available models on the Gaia node
     * @dev Verifies that required models are available
     */
  async _checkAvailableModels () {
    try {
      this.logger.debug('Checking available Gaia models...');

      const response = await this.httpClient.get('/models');

      if (response.status === 200 && response.data?.data) {
        const availableModels = response.data.data.map(model => model.id);

        this.logger.info('📋 Available Gaia models', {
          models: availableModels,
          count: availableModels.length
        });

        // ============ Validate Required Models ============
        const requiredModels = [this.modelConfig.primary.name, this.modelConfig.fast.name];
        const missingModels = requiredModels.filter(model =>
          !availableModels.some(available => available.includes(model))
        );

        if (missingModels.length > 0) {
          this.logger.warn('⚠️ Some required models not found', {
            missing: missingModels,
            available: availableModels
          });
          // Don't fail initialization, use available models
        }

        return availableModels;
      } else {
        this.logger.warn('⚠️ Could not retrieve model list - continuing with default models');
        return [];
      }
    } catch (error) {
      this.logger.warn('⚠️ Model check failed - continuing with default configuration', {
        error: error.message
      });
      return [];
    }
  }

  // ============ Core AI Analysis Methods ============

  /**
     * @notice Get comprehensive market analysis for scalping opportunities
     * @param {Array} tradingPairs - Trading pairs to analyze
     * @param {Object} marketData - Current market data context
     * @returns {Object} Detailed market analysis with actionable insights
     */
  async getMarketAnalysis (tradingPairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDC'], marketData = {}) {
    this._ensureInitialized();

    try {
      // Ensure tradingPairs is always an array
      const pairsArray = Array.isArray(tradingPairs) ? tradingPairs : [tradingPairs];
      const cacheKey = `market_analysis_${pairsArray.join('_')}_${JSON.stringify(marketData).slice(0, 50)}`;
      const cached = this._getFromCache(cacheKey);

      if (cached) {
        this.logger.info('📋 GAIA AI - Using cached analysis', {
          pairs: pairsArray,
          cacheAge: `${Math.round((Date.now() - (cached.timestamp || 0)) / 1000)}s ago`
        });
        return cached;
      }

      this.logger.info('🤖 GAIA AI - Starting fresh market analysis', {
        pairs: pairsArray,
        model: this.model,
        nodeUrl: this.nodeUrl.substring(0, 50) + '...',
        marketData: Object.keys(marketData),
        timestamp: new Date().toISOString()
      });

      const currentTime = new Date().toISOString();
      const prompt = `Perform comprehensive cryptocurrency market analysis for high-frequency scalping trading.

TRADING PAIRS: ${pairsArray.join(', ')}
CURRENT TIME: ${currentTime}
COMPETITION TIMEFRAME: 1 hour maximum
STRATEGY FOCUS: Scalping (1-5 minute holds)

CURRENT MARKET CONTEXT:
${marketData.volatility ? `- Market Volatility: ${marketData.volatility}` : ''}
${marketData.trend ? `- Overall Trend: ${marketData.trend}` : ''}
${marketData.volume ? `- Trading Volume: ${marketData.volume}` : ''}

ANALYSIS REQUIREMENTS:
1. Market Regime Assessment (trending vs ranging vs high volatility)
2. Immediate scalping opportunities (next 5-10 minutes)
3. Cross-exchange arbitrage potential
4. Risk factors and market warnings
5. Optimal pairs for current conditions
6. Support/resistance levels for quick bounces
7. News/event impact timing

RESPOND IN THIS EXACT JSON FORMAT:
{
    "marketRegime": "trending_bull|trending_bear|ranging|high_volatility|low_volatility",
    "confidence": 0.85,
    "overallTrend": "bullish|bearish|sideways",
    "volatilityLevel": "low|moderate|high|extreme",
    "riskLevel": 0.65,
    "scalpingOpportunities": [
        {
            "pair": "BTC/USDT",
            "direction": "buy|sell|hold",
            "confidence": 0.78,
            "entryZone": 51250,
            "targetProfit": 51750,
            "stopLoss": 50950,
            "timeframe": "3-7 minutes",
            "expectedMove": 0.8,
            "reasoning": "Strong support bounce with volume confirmation"
        }
    ],
    "arbitrageOpportunities": [
        {
            "type": "cross_exchange|cross_chain|temporal",
            "pair": "ETH/USDT", 
            "opportunity": "Price difference between Binance and Uniswap",
            "profitPotential": 0.25,
            "executionTime": "2-5 minutes",
            "riskFactors": ["slippage", "gas costs"]
        }
    ],
    "supportResistance": {
        "BTC/USDT": {"support": [50800, 50500], "resistance": [51500, 52000]},
        "ETH/USDT": {"support": [3180, 3150], "resistance": [3220, 3250]}
    },
    "newsImpact": {
        "level": "low|medium|high",
        "timeframe": "immediate|15min|1hour",
        "description": "Brief description of news impact"
    },
    "riskWarnings": ["Market manipulation detected", "Low liquidity period"],
    "optimalPairs": ["BTC/USDT", "ETH/USDT"],
    "executionNotes": "Wait for volume confirmation before entering positions",
    "timestamp": "${Date.now()}"
}`;

      const analysis = await this._performAnalysis('marketAnalyst', prompt, this.modelConfig.primary);

      // ============ Enhance Analysis with Additional Context ============
      const enhancedAnalysis = this._enhanceMarketAnalysis(analysis, marketData);

      // ============ Cache with Shorter TTL for Market Data ============
      this._setCache(cacheKey, enhancedAnalysis, this.cacheTimeout);

      this.logger.info('🧠 GAIA AI - Analysis completed successfully', {
        pairs: pairsArray,
        signalsGenerated: Object.keys(enhancedAnalysis.signals || {}).length,
        sentiment: enhancedAnalysis.sentiment || 'neutral',
        confidence: enhancedAnalysis.confidence || 'unknown',
        opportunities: enhancedAnalysis.scalpingOpportunities?.length || 0,
        riskLevel: enhancedAnalysis.riskLevel,
        keyInsights: enhancedAnalysis.summary?.substring(0, 80) + '...' || 'No summary available',
        status: '✅ GAIA SUCCESS'
      });

      return enhancedAnalysis;
    } catch (error) {
      this.logger.error('❌ Failed to generate market analysis', {
        error: error.message,
        pairs: tradingPairs
      });
      return this._getDefaultMarketAnalysis(tradingPairs);
    }
  }

  /**
     * @notice Get real-time sentiment analysis for trading decisions
     * @param {string} pair - Trading pair to analyze
     * @param {Object} contextData - Additional context for sentiment analysis
     * @returns {Object} Comprehensive sentiment analysis
     */
  async getSentimentAnalysis (pair, contextData = {}) {
    this._ensureInitialized();

    try {
      const cacheKey = `sentiment_${pair}_${JSON.stringify(contextData).slice(0, 30)}`;
      const cached = this._getFromCache(cacheKey, this.sentimentCacheTimeout);

      if (cached) {
        this.logger.debug('💭 Returning cached sentiment analysis');
        return cached;
      }

      const currentTime = new Date().toISOString();
      const prompt = `Analyze cryptocurrency sentiment for immediate trading decisions.

PAIR: ${pair}
CURRENT TIME: ${currentTime}
TRADING STRATEGY: High-frequency scalping

CONTEXT DATA:
${contextData.priceAction ? `- Recent Price Action: ${contextData.priceAction}` : ''}
${contextData.volume ? `- Volume Pattern: ${contextData.volume}` : ''}
${contextData.technicals ? `- Technical Signals: ${JSON.stringify(contextData.technicals)}` : ''}

SENTIMENT SOURCES TO ANALYZE:
1. Twitter/X crypto community sentiment and influencer signals
2. Reddit discussions and sentiment shifts
3. Discord trading group sentiment
4. Recent news impact and timing
5. Derivatives market sentiment (funding rates, liquidations)
6. Fear & Greed indicators
7. Whale activity and large order flow

FOCUS: Sentiment shifts affecting prices in next 5-15 minutes

RESPOND IN THIS EXACT JSON FORMAT:
{
    "pair": "${pair}",
    "sentimentScore": 0.72,
    "sentiment": "very_bearish|bearish|neutral|bullish|very_bullish",
    "confidence": 0.84,
    "timeframe": "5-15 minutes",
    "momentumShift": "bullish_acceleration|bearish_acceleration|consolidation|reversal_pending",
    "sentimentFactors": {
        "social": {
            "score": 0.68,
            "impact": "high|medium|low",
            "signals": ["Positive whale accumulation tweets", "Bullish TA from influencers"]
        },
        "news": {
            "score": 0.55,
            "impact": "high|medium|low",
            "recent": "Partnership announcement boosting confidence"
        },
        "technical": {
            "score": 0.75,
            "momentum": "bullish|bearish|neutral",
            "signals": ["Breaking resistance", "Volume surge"]
        },
        "derivatives": {
            "score": 0.60,
            "fundingRate": "positive|negative|neutral",
            "liquidations": "long_squeeze|short_squeeze|balanced"
        }
    },
    "keyDrivers": [
        "Major whale accumulation detected",
        "Technical breakout confirmation",
        "Positive funding rate shift"
    ],
    "contraindicators": [
        "High funding rates suggest euphoria",
        "Social sentiment may be overextended"
    ],
    "tradingImpact": {
        "direction": "buy_pressure|sell_pressure|balanced",
        "strength": "weak|moderate|strong|extreme",
        "duration": "1-5min|5-15min|15-60min"
    },
    "riskFactors": ["Sentiment reversal risk", "News dependency"],
    "actionable": "Strong bullish sentiment with technical confirmation - consider long positions",
    "timestamp": "${Date.now()}"
}`;

      const sentiment = await this._performAnalysis('sentimentAnalyst', prompt, this.modelConfig.primary);

      // ============ Add Sentiment Momentum Calculation ============
      const enhancedSentiment = this._enhanceSentimentAnalysis(sentiment, pair);

      // ============ Cache with Longer TTL for Sentiment ============
      this._setCache(cacheKey, enhancedSentiment, this.sentimentCacheTimeout);

      this.logger.info('💭 Sentiment analysis generated', {
        pair,
        sentiment: enhancedSentiment.sentiment,
        score: enhancedSentiment.sentimentScore,
        confidence: enhancedSentiment.confidence
      });

      return enhancedSentiment;
    } catch (error) {
      this.logger.error('❌ Failed to generate sentiment analysis', {
        error: error.message,
        pair
      });
      return this._getDefaultSentiment(pair);
    }
  }

  /**
     * @notice Get quantitative risk assessment for position sizing
     * @param {Object} portfolioData - Current portfolio and market state
     * @returns {Object} Comprehensive risk assessment with recommendations
     */
  async getRiskAssessment (portfolioData = {}) {
    this._ensureInitialized();

    try {
      const cacheKey = `risk_assessment_${JSON.stringify(portfolioData).slice(0, 100)}`;
      const cached = this._getFromCache(cacheKey);

      if (cached) {
        this.logger.debug('⚡ Returning cached risk assessment');
        return cached;
      }

      const currentTime = new Date().toISOString();
      const prompt = `Perform quantitative risk assessment for cryptocurrency scalping trading.

CURRENT TIME: ${currentTime}
TRADING STRATEGY: High-frequency scalping (1-5 minute holds)
COMPETITION TIMEFRAME: 1 hour maximum

PORTFOLIO STATE:
- Total Portfolio Value: $${portfolioData.totalValue || 10000}
- Available Balance: $${portfolioData.availableBalance || 8000}
- Current Positions: ${portfolioData.activePositions || 0}
- Daily P&L: ${portfolioData.dailyPnL || 0}%
- Current Drawdown: ${portfolioData.currentDrawdown || 0}%
- Trades Today: ${portfolioData.tradesCount || 0}

MARKET CONDITIONS:
- Overall Volatility: ${portfolioData.marketVolatility || 'moderate'}
- Liquidity Conditions: ${portfolioData.liquidity || 'normal'}
- Active Pairs: ${(portfolioData.activePairs || ['BTC/USDT', 'ETH/USDT']).join(', ')}

RISK ANALYSIS REQUIREMENTS:
1. Real-time volatility assessment
2. Position sizing optimization for scalping
3. Correlation risk between positions  
4. Liquidity risk evaluation
5. Systemic market risks
6. Stop-loss and take-profit recommendations
7. Capital preservation strategies

RESPOND IN THIS EXACT JSON FORMAT:
{
    "overallRisk": "very_low|low|moderate|high|extreme",
    "riskScore": 0.65,
    "riskComponents": {
        "volatilityRisk": {
            "score": 0.70,
            "level": "moderate",
            "impact": "Position sizes should be reduced by 20%"
        },
        "liquidityRisk": {
            "score": 0.45,
            "level": "low",
            "impact": "Good execution conditions for scalping"
        },
        "correlationRisk": {
            "score": 0.55,
            "level": "moderate", 
            "impact": "BTC and ETH highly correlated - diversify"
        },
        "systemicRisk": {
            "score": 0.40,
            "level": "low",
            "impact": "No major systemic threats detected"
        }
    },
    "positionSizing": {
        "maxPositionPercent": 8.5,
        "recommendedSize": 5.2,
        "maxConcurrentPositions": 3,
        "capitalAllocation": "Conservative due to volatility"
    },
    "riskLimits": {
        "stopLossPercent": 0.8,
        "takeProfitPercent": 1.2,
        "maxDailyDrawdown": 3.0,
        "maxPositionHoldTime": "8 minutes"
    },
    "recommendations": [
        "Reduce position sizes in current volatility regime",
        "Use tighter stops for scalping strategy",
        "Monitor correlation between BTC and ETH positions",
        "Take profits quickly in ranging market"
    ],
    "criticalWarnings": [
        "High correlation between major pairs increases portfolio risk"
    ],
    "mitigationStrategies": [
        "Use uncorrelated pairs like SOL/USDC",
        "Implement trailing stops",
        "Scale out of profitable positions",
        "Monitor news flow for sudden volatility"
    ],
    "confidenceLevel": 0.82,
    "timestamp": "${Date.now()}"
}`;

      const riskAssessment = await this._performAnalysis('riskAssessor', prompt, this.modelConfig.primary);

      // ============ Add Dynamic Risk Adjustments ============
      const enhancedRisk = this._enhanceRiskAssessment(riskAssessment, portfolioData);

      // ============ Cache Risk Assessment ============
      this._setCache(cacheKey, enhancedRisk);

      this.logger.info('⚡ Risk assessment generated', {
        overallRisk: enhancedRisk.overallRisk,
        riskScore: enhancedRisk.riskScore,
        maxPosition: enhancedRisk.positionSizing?.maxPositionPercent
      });

      return enhancedRisk;
    } catch (error) {
      this.logger.error('❌ Failed to generate risk assessment', {
        error: error.message,
        portfolio: portfolioData
      });
      return this._getDefaultRiskAssessment();
    }
  }

  // ============ Specialized Trading Analysis ============

  /**
     * @notice Get quick trading signal for immediate execution
     * @param {string} pair - Trading pair
     * @param {Object} technicalData - Current technical indicators
     * @param {Object} marketContext - Additional market context
     * @returns {Object} Actionable trading signal
     */
  async getQuickTradingSignal (pair, technicalData = {}, marketContext = {}) {
    this._ensureInitialized();

    try {
      const prompt = `Generate immediate scalping signal for ${pair}.

TECHNICAL INDICATORS:
- RSI (1m): ${technicalData.rsi || 'N/A'}
- RSI (5m): ${technicalData.rsi5m || 'N/A'}
- MACD Signal: ${technicalData.macd || 'N/A'}
- Volume Spike: ${technicalData.volumeSpike || 'N/A'}x
- Price vs EMA20: ${technicalData.emaPosition || 'N/A'}
- Bollinger Position: ${technicalData.bbPosition || 'N/A'}

MARKET CONTEXT:
- Current Trend: ${marketContext.trend || 'N/A'}
- Market Regime: ${marketContext.regime || 'N/A'}
- Volatility: ${marketContext.volatility || 'N/A'}
- Time: ${new Date().toISOString()}

SIGNAL REQUIREMENTS:
- Execution timeframe: Next 2-5 minutes
- Strategy: Scalping (quick in/out)
- Risk tolerance: Low (tight stops)

RESPOND IN THIS EXACT JSON FORMAT:
{
    "signal": "BUY|SELL|HOLD",
    "confidence": 0.78,
    "strength": "weak|moderate|strong|very_strong",
    "entryPrice": 51250.5,
    "stopLoss": 50950.0,
    "takeProfit": 51650.0,
    "positionSize": 0.05,
    "timeframe": "3-5 minutes",
    "riskReward": 2.1,
    "reasoning": "RSI oversold bounce with volume confirmation",
    "technicalSetup": "Support bounce with momentum divergence",
    "executionNotes": "Wait for volume confirmation above 1.5x average",
    "invalidationLevel": 50900.0,
    "urgency": "immediate|within_1min|within_5min",
    "marketConditions": "favorable|neutral|challenging",
    "timestamp": "${Date.now()}"
}`;

      const signal = await this._performAnalysis('marketAnalyst', prompt, this.modelConfig.fast);

      this.logger.debug('⚡ Quick signal generated', {
        pair,
        signal: signal.signal,
        confidence: signal.confidence,
        timeframe: signal.timeframe
      });

      return signal;
    } catch (error) {
      this.logger.error('❌ Failed to generate quick signal', {
        error: error.message,
        pair
      });
      return this._getDefaultQuickSignal(pair);
    }
  }

  /**
     * @notice Detect cross-chain and cross-exchange arbitrage opportunities
     * @param {Array} exchanges - Exchanges to analyze
     * @param {Array} chains - Blockchain networks to analyze
     * @returns {Object} Arbitrage opportunities with execution details
     */
  async getArbitrageOpportunities (exchanges = ['binance', 'uniswap', 'sushiswap'], chains = ['ethereum', 'polygon', 'arbitrum']) {
    this._ensureInitialized();

    try {
      const cacheKey = `arbitrage_${exchanges.join('_')}_${chains.join('_')}`;
      const cached = this._getFromCache(cacheKey, 30000); // 30 second cache for arbitrage

      if (cached) {
        return cached;
      }

      const prompt = `Analyze arbitrage opportunities for cryptocurrency scalping.

EXCHANGES: ${exchanges.join(', ')}
CHAINS: ${chains.join(', ')}
FOCUS: Opportunities executable within 10 minutes
MINIMUM PROFIT: 0.15% after all costs

ANALYSIS SCOPE:
1. Cross-exchange price differences (CEX vs DEX)
2. Cross-chain arbitrage opportunities
3. Triangular arbitrage patterns
4. Temporal arbitrage from news/events
5. Gas cost optimization strategies

TRADING PAIRS TO ANALYZE:
- BTC/USDT, ETH/USDT, USDC/USDT
- SOL/USDC, MATIC/USDT
- High-volume ERC-20 tokens

COST CONSIDERATIONS:
- Gas fees on different chains
- Bridge costs and time delays
- Trading fees on each exchange
- Slippage for position sizes

RESPOND IN THIS EXACT JSON FORMAT:
{
    "opportunities": [
        {
            "type": "cross_exchange|cross_chain|triangular|temporal",
            "pair": "ETH/USDT",
            "source": "uniswap",
            "target": "binance",
            "sourcePriceEstimate": 3205.5,
            "targetPriceEstimate": 3212.8,
            "priceDifference": 0.23,
            "grossProfitPercent": 0.23,
            "estimatedCosts": {
                "gasFees": 15.5,
                "tradingFees": 0.08,
                "bridgeFees": 0.0,
                "totalCostPercent": 0.08
            },
            "netProfitPercent": 0.15,
            "executionTime": "5-8 minutes",
            "liquidityDepth": 50000,
            "riskFactors": ["slippage", "gas price volatility"],
            "confidence": 0.75,
            "urgency": "execute_immediately|within_5min|within_10min"
        }
    ],
    "gasOptimization": {
        "ethereum": {
            "currentGwei": 25,
            "recommendedGwei": 22,
            "optimalTime": "next 10 minutes"
        },
        "polygon": {
            "currentGwei": 35,
            "costInUSD": 0.02
        }
    },
    "bridgeAnalysis": {
        "ethereum_to_polygon": {
            "avgTime": "8 minutes",
            "cost": 0.05,
            "reliability": "high"
        }
    },
    "marketImpact": {
        "priceImpactWarning": "Large trades may affect prices",
        "liquidityWarnings": ["Low USDC liquidity on Polygon"]
    },
    "executionStrategy": [
        "Monitor gas prices for optimal entry",
        "Execute larger amounts on higher liquidity exchanges",
        "Use limit orders to minimize slippage"
    ],
    "timestamp": "${Date.now()}"
}`;

      const arbitrageAnalysis = await this._performAnalysis('arbitrageDetector', prompt, this.modelConfig.primary);

      // ============ Filter Profitable Opportunities ============
      const filteredOpportunities = this._filterArbitrageOpportunities(arbitrageAnalysis);

      // ============ Short Cache for Fast-Moving Arbitrage Data ============
      this._setCache(cacheKey, filteredOpportunities, 30000);

      this.logger.info('🔄 Arbitrage analysis generated', {
        totalOpportunities: arbitrageAnalysis.opportunities?.length || 0,
        profitableOpportunities: filteredOpportunities.opportunities?.length || 0
      });

      return filteredOpportunities;
    } catch (error) {
      this.logger.error('❌ Failed to generate arbitrage analysis', {
        error: error.message,
        exchanges,
        chains
      });
      return this._getDefaultArbitrageAnalysis();
    }
  }

  // ============ Core Chat Interface with Enhanced Error Handling ============

  /**
     * @notice Send chat request to Gaia node with comprehensive error handling
     * @param {Object} chatRequest - Chat request configuration
     * @returns {string} AI response content
     */
  async chat (chatRequest) {
    this._ensureInitialized();

    try {
      // ============ Input Validation ============
      if (!chatRequest.messages || !Array.isArray(chatRequest.messages)) {
        throw new Error('Invalid chat request: messages array required');
      }

      // ============ Rate Limiting Check ============
      this._checkRateLimit();

      // ============ Prepare Request with Gaia-Compatible Format ============
      const request = {
        messages: chatRequest.messages,
        model: chatRequest.model || this.modelConfig.primary.name,
        max_tokens: Math.min(chatRequest.max_tokens || this.modelConfig.primary.maxTokens, 4000),
        temperature: chatRequest.temperature ?? this.modelConfig.primary.temperature,
        top_p: chatRequest.top_p ?? this.modelConfig.primary.topP,
        stream: false, // Always use non-streaming for analysis
        frequency_penalty: 0.1, // Reduce repetition
        presence_penalty: 0.1 // Encourage diverse responses
      };

      this.logger.debug('📤 Sending Gaia chat request', {
        messageCount: request.messages.length,
        model: request.model,
        maxTokens: request.max_tokens
      });

      const startTime = Date.now();

      // ============ Execute Request with Timeout ============
      const response = await this.httpClient.post('/chat/completions', request);

      const responseTime = Date.now() - startTime;
      this._updateMetrics(true, responseTime);

      // ============ Validate Response Structure ============
      if (!response.data || !response.data.choices || !response.data.choices[0]) {
        throw new Error('Invalid response structure from Gaia');
      }

      const choice = response.data.choices[0];
      const content = choice.message?.content;

      if (!content) {
        throw new Error('Empty response content from Gaia');
      }

      // ============ Log Successful Response ============
      this.logger.debug('📥 Gaia response received', {
        responseTime: `${responseTime}ms`,
        contentLength: content.length,
        finishReason: choice.finish_reason,
        usage: response.data.usage
      });

      return content;
    } catch (error) {
      this._updateMetrics(false);

      // ============ Enhanced Error Handling with Context ============
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;

        this.logger.error('❌ Gaia API error', {
          status,
          error: errorData?.error || 'Unknown error',
          message: errorData?.message,
          model: chatRequest.model
        });

        // ============ Specific Error Handling ============
        if (status === 400) {
          throw new Error(`Bad request: ${errorData?.error || 'Invalid request format'}`);
        } else if (status === 401) {
          throw new Error('Authentication failed - check GAIA_API_KEY');
        } else if (status === 429) {
          throw new Error('Rate limit exceeded - reduce request frequency');
        } else if (status === 503) {
          throw new Error('Gaia node temporarily unavailable');
        } else {
          throw new Error(`Gaia API error ${status}: ${errorData?.error || 'Unknown error'}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout - Gaia node response too slow');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Connection refused - Gaia node unreachable');
      } else {
        this.logger.error('❌ Gaia chat request failed', { error: error.message });
        throw new Error(`Chat request failed: ${error.message}`);
      }
    }
  }

  // ============ Request Queue Management ============

  /**
     * @notice Start the request queue processor for handling high volume
     * @dev Processes queued requests to prevent overwhelming the Gaia node
     */
  _startQueueProcessor () {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;

    const processQueue = async () => {
      while (this.requestQueue.length > 0 && this.isProcessingQueue) {
        const { request, resolve, reject } = this.requestQueue.shift();

        try {
          const result = await this.chat(request);
          resolve(result);
        } catch (error) {
          reject(error);
        }

        // ============ Small Delay Between Queued Requests ============
        await this._sleep(100);
      }

      // ============ Continue Processing After Delay ============
      if (this.isProcessingQueue) {
        setTimeout(processQueue, 1000);
      }
    };

    processQueue();
    this.logger.debug('🔄 Request queue processor started');
  }

  /**
     * @notice Add request to queue when rate limits are hit
     * @param {Object} chatRequest - Chat request to queue
     * @returns {Promise} Promise that resolves when request is processed
     */
  async _queueRequest (chatRequest) {
    if (this.requestQueue.length >= this.maxQueueSize) {
      throw new Error('Request queue full - reduce request rate');
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push({ request: chatRequest, resolve, reject });
      this.logger.debug('📋 Request queued', { queueSize: this.requestQueue.length });
    });
  }

  // ============ Internal Analysis Enhancement Methods ============

  /**
     * @notice Perform AI analysis with enhanced error handling and retries
     * @param {string} analystType - Type of analyst system prompt
     * @param {string} prompt - Analysis prompt
     * @param {Object} modelConfig - Model configuration to use
     * @returns {Object} Parsed and enhanced analysis result
     */
  async _performAnalysis (analystType, prompt, modelConfig = this.modelConfig.primary) {
    try {
      const systemPrompt = this.systemPrompts[analystType];
      if (!systemPrompt) {
        throw new Error(`Unknown analyst type: ${analystType}`);
      }

      // ============ Prepare Chat Request ============
      const chatRequest = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        model: modelConfig.name,
        max_tokens: modelConfig.maxTokens,
        temperature: modelConfig.temperature,
        top_p: modelConfig.topP
      };

      // ============ Execute with Retry Logic ============
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await this.chat(chatRequest);
          return this._parseAnalysisResponse(response, analystType);
        } catch (error) {
          lastError = error;

          if (attempt < 3 && (error.message.includes('rate limit') || error.message.includes('timeout') || error.message.includes('slow'))) {
            this.logger.warn(`🔄 ${error.message.includes('rate limit') ? 'Rate limit' : 'Timeout'} hit, retrying attempt ${attempt + 1}/3`);
            await this._sleep(2000 * attempt); // Exponential backoff
            continue;
          }
          break;
        }
      }

      throw lastError;
    } catch (error) {
      this.logger.error(`❌ Analysis failed for ${analystType}`, {
        error: error.message,
        modelConfig: modelConfig.name
      });
      throw error;
    }
  }

  /**
     * @notice Parse and validate AI response with enhanced error handling
     * @param {string} response - Raw AI response
     * @param {string} analystType - Type of analysis for validation
     * @returns {Object} Parsed and validated analysis
     */
  _parseAnalysisResponse (response, analystType = 'general') {
    try {
      // ============ Extract JSON from Response ============
      let jsonStr = response.trim();

      // Try to find JSON block markers
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      }

      // ============ Parse and Validate JSON ============
      const parsed = JSON.parse(jsonStr);

      // ============ Add Metadata ============
      parsed.analystType = analystType;
      parsed.timestamp = parsed.timestamp || Date.now();
      parsed.responseLength = response.length;

      // ============ Validate Required Fields Based on Analysis Type ============
      const validated = this._validateAnalysisResponse(parsed, analystType);

      this.logger.debug('✅ Analysis response parsed successfully', {
        analystType,
        hasTimestamp: !!validated.timestamp,
        confidence: validated.confidence || 'N/A'
      });

      return validated;
    } catch (parseError) {
      this.logger.warn('⚠️ JSON parsing failed, creating structured response', {
        analystType,
        responseLength: response.length,
        error: parseError.message
      });

      // ============ Fallback: Create Structured Response ============
      return this._createFallbackResponse(response, analystType, parseError);
    }
  }

  /**
     * @notice Validate analysis response based on expected structure
     * @param {Object} parsed - Parsed JSON response
     * @param {string} analystType - Type of analysis
     * @returns {Object} Validated response with defaults for missing fields
     */
  _validateAnalysisResponse (parsed, analystType) {
    const validated = { ...parsed };

    // ============ Common Required Fields ============
    validated.confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    validated.timestamp = parsed.timestamp || Date.now();

    // ============ Type-Specific Validation ============
    switch (analystType) {
      case 'marketAnalyst':
        validated.marketRegime = parsed.marketRegime || 'ranging';
        validated.overallTrend = parsed.overallTrend || 'sideways';
        validated.riskLevel = typeof parsed.riskLevel === 'number' ? parsed.riskLevel : 0.5;
        validated.scalpingOpportunities = Array.isArray(parsed.scalpingOpportunities)
          ? parsed.scalpingOpportunities
          : [];
        break;

      case 'sentimentAnalyst':
        validated.sentimentScore = typeof parsed.sentimentScore === 'number'
          ? Math.max(0, Math.min(1, parsed.sentimentScore))
          : 0.5;
        validated.sentiment = parsed.sentiment || 'neutral';
        validated.pair = parsed.pair || 'Unknown';
        break;

      case 'riskAssessor':
        validated.overallRisk = parsed.overallRisk || 'moderate';
        validated.riskScore = typeof parsed.riskScore === 'number' ? parsed.riskScore : 0.5;
        validated.positionSizing = parsed.positionSizing || {};
        break;

      case 'arbitrageDetector':
        validated.opportunities = Array.isArray(parsed.opportunities)
          ? parsed.opportunities
          : [];
        break;
    }

    return validated;
  }

  /**
     * @notice Create fallback response when JSON parsing fails
     * @param {string} response - Original response text
     * @param {string} analystType - Type of analysis
     * @param {Error} parseError - JSON parsing error
     * @returns {Object} Fallback structured response
     */
  _createFallbackResponse (response, analystType, parseError) {
    const baseResponse = {
      analysis: response.substring(0, 500) + (response.length > 500 ? '...' : ''),
      confidence: 0.3,
      reasoning: 'Text-based analysis - JSON parsing failed',
      timestamp: Date.now(),
      parseError: parseError.message,
      analystType,
      fallback: true
    };

    // ============ Add Type-Specific Fallback Fields ============
    switch (analystType) {
      case 'marketAnalyst':
        return {
          ...baseResponse,
          marketRegime: 'ranging',
          overallTrend: 'sideways',
          riskLevel: 0.5,
          scalpingOpportunities: [],
          supportResistance: {},
          riskWarnings: ['AI analysis parsing failed']
        };

      case 'sentimentAnalyst':
        return {
          ...baseResponse,
          sentimentScore: 0.5,
          sentiment: 'neutral',
          pair: 'Unknown',
          sentimentFactors: {},
          keyDrivers: ['Analysis parsing failed']
        };

      case 'riskAssessor':
        return {
          ...baseResponse,
          overallRisk: 'moderate',
          riskScore: 0.5,
          positionSizing: { maxPositionPercent: 5 },
          recommendations: ['Use conservative position sizing']
        };

      default:
        return baseResponse;
    }
  }

  // ============ Analysis Enhancement Methods ============

  /**
     * @notice Enhance market analysis with additional context and validation
     * @param {Object} analysis - Raw analysis from AI
     * @param {Object} marketData - Additional market context
     * @returns {Object} Enhanced analysis
     */
  _enhanceMarketAnalysis (analysis, marketData) {
    try {
      const enhanced = { ...analysis };

      // ============ Add Market Context Validation ============
      if (marketData.volume && enhanced.scalpingOpportunities) {
        enhanced.scalpingOpportunities = enhanced.scalpingOpportunities.map(opp => ({
          ...opp,
          volumeValidated: marketData.volume > 1000000, // Minimum volume check
          liquidityScore: this._calculateLiquidityScore(opp.pair, marketData)
        }));
      }

      // ============ Add Risk-Adjusted Confidence ============
      if (enhanced.riskLevel > 0.7) {
        enhanced.confidence = Math.max(0.3, enhanced.confidence * 0.8); // Reduce confidence in high risk
      }

      // ============ Add Execution Timing ============
      enhanced.executionWindow = {
        optimal: Date.now() + 60000, // Next 1 minute
        deadline: Date.now() + 300000, // 5 minutes max
        reason: 'Market conditions may change rapidly'
      };

      // ============ Add Performance Tracking ============
      enhanced.analysisMetadata = {
        generatedAt: Date.now(),
        modelUsed: this.modelConfig.primary.name,
        cacheStatus: 'fresh',
        enhancementApplied: true
      };

      return enhanced;
    } catch (error) {
      this.logger.warn('⚠️ Failed to enhance market analysis', { error: error.message });
      return analysis;
    }
  }

  /**
     * @notice Enhance sentiment analysis with momentum calculations
     * @param {Object} sentiment - Raw sentiment analysis
     * @param {string} pair - Trading pair
     * @returns {Object} Enhanced sentiment analysis
     */
  _enhanceSentimentAnalysis (sentiment, pair) {
    try {
      const enhanced = { ...sentiment };

      // ============ Calculate Sentiment Momentum ============
      const previousSentiment = this._getPreviousSentiment(pair);
      if (previousSentiment) {
        enhanced.sentimentMomentum = {
          direction: sentiment.sentimentScore > previousSentiment.sentimentScore ? 'increasing' : 'decreasing',
          strength: Math.abs(sentiment.sentimentScore - previousSentiment.sentimentScore),
          timeframe: Date.now() - previousSentiment.timestamp
        };
      }

      // ============ Add Contrarian Indicators ============
      if (sentiment.sentimentScore > 0.85) {
        enhanced.contrarianWarning = {
          level: 'high',
          reason: 'Extremely bullish sentiment may indicate reversal risk',
          recommendation: 'Consider taking profits or reducing position size'
        };
      } else if (sentiment.sentimentScore < 0.15) {
        enhanced.contrarianWarning = {
          level: 'high',
          reason: 'Extremely bearish sentiment may indicate bounce opportunity',
          recommendation: 'Watch for reversal signals'
        };
      }

      // ============ Store for Future Momentum Calculations ============
      this._storeSentimentHistory(pair, enhanced);

      return enhanced;
    } catch (error) {
      this.logger.warn('⚠️ Failed to enhance sentiment analysis', { error: error.message });
      return sentiment;
    }
  }

  /**
     * @notice Enhance risk assessment with dynamic adjustments
     * @param {Object} riskAssessment - Raw risk assessment
     * @param {Object} portfolioData - Portfolio context
     * @returns {Object} Enhanced risk assessment
     */
  _enhanceRiskAssessment (riskAssessment, portfolioData) {
    try {
      const enhanced = { ...riskAssessment };

      // ============ Adjust for Portfolio State ============
      if (portfolioData.currentDrawdown > 2) {
        enhanced.positionSizing.maxPositionPercent *= 0.7; // Reduce size in drawdown
        enhanced.recommendations.push('Reduced position sizing due to current drawdown');
      }

      if (portfolioData.tradesCount > 20) {
        enhanced.overallRisk = this._increaseRiskLevel(enhanced.overallRisk);
        enhanced.recommendations.push('High trade frequency increases execution risk');
      }

      // ============ Add Time-Based Adjustments ============
      const hour = new Date().getHours();
      if (hour < 6 || hour > 22) { // Outside major trading hours
        enhanced.liquidityWarning = {
          level: 'moderate',
          reason: 'Trading outside major market hours may have reduced liquidity',
          adjustment: 'Consider smaller position sizes'
        };
      }

      // ============ Add Performance-Based Adjustments ============
      if (portfolioData.dailyPnL < -1) {
        enhanced.emergencyProtocol = {
          activated: true,
          maxPositionPercent: Math.min(enhanced.positionSizing.maxPositionPercent, 2),
          reason: 'Negative daily P&L triggers conservative mode'
        };
      }

      return enhanced;
    } catch (error) {
      this.logger.warn('⚠️ Failed to enhance risk assessment', { error: error.message });
      return riskAssessment;
    }
  }

  // ============ Rate Limiting and Performance ============

  /**
     * @notice Check and enforce rate limiting with enhanced logic
     * @dev Prevents API abuse and ensures stable performance
     */
  _checkRateLimit () {
    const now = Date.now();

    // ============ Reset Window if Needed ============
    if (now - this.lastWindowReset > this.requestWindow) {
      this.requestCount = 0;
      this.lastWindowReset = now;
    }

    // ============ Check Current Limit ============
    if (this.requestCount >= this.maxRequestsPerWindow) {
      const waitTime = this.requestWindow - (now - this.lastWindowReset);
      this.logger.warn('⚠️ Rate limit reached', {
        requestCount: this.requestCount,
        maxRequests: this.maxRequestsPerWindow,
        waitTime: `${Math.ceil(waitTime / 1000)}s`
      });
      throw new Error(`Rate limit exceeded. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    this.requestCount++;
  }

  /**
     * @notice Update performance metrics
     * @param {boolean} success - Whether request was successful
     * @param {number} responseTime - Response time in milliseconds
     */
  _updateMetrics (success, responseTime = 0) {
    this.metrics.totalRequests++;

    if (success) {
      this.metrics.successfulRequests++;
      if (responseTime > 0) {
        // ============ Update Average Response Time ============
        const totalTime = this.metrics.avgResponseTime * (this.metrics.successfulRequests - 1) + responseTime;
        this.metrics.avgResponseTime = totalTime / this.metrics.successfulRequests;
        this.metrics.lastResponseTime = responseTime;
      }
    } else {
      this.metrics.failedRequests++;
    }

    // ============ Update Cache Hit Rate ============
    const cacheHits = this.metrics.totalRequests - this.metrics.successfulRequests - this.metrics.failedRequests;
    this.metrics.cacheHitRate = cacheHits / this.metrics.totalRequests;
  }

  // ============ Caching System with TTL ============

  /**
     * @notice Get analysis from cache with custom TTL support
     * @param {string} key - Cache key
     * @param {number} customTTL - Custom TTL override
     * @returns {Object|null} Cached analysis or null
     */
  _getFromCache (key, customTTL = this.cacheTimeout) {
    const cached = this.analysisCache.get(key);

    if (cached && (Date.now() - cached.timestamp) < customTTL) {
      this.logger.debug('📋 Cache hit', { key, age: Date.now() - cached.timestamp });
      return cached.data;
    }

    if (cached) {
      this.analysisCache.delete(key); // Remove expired cache
    }

    return null;
  }

  /**
     * @notice Store analysis in cache with optional custom TTL
     * @param {string} key - Cache key
     * @param {Object} data - Analysis data to cache
     * @param {number} customTTL - Custom TTL for this cache entry
     */
  _setCache (key, data, customTTL = this.cacheTimeout) {
    this.analysisCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: customTTL
    });

    // ============ Intelligent Cache Cleanup ============
    if (this.analysisCache.size > 200) {
      const sortedEntries = Array.from(this.analysisCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      // Remove oldest 50 entries
      for (let i = 0; i < 50; i++) {
        this.analysisCache.delete(sortedEntries[i][0]);
      }

      this.logger.debug('🧹 Cache cleaned', { remainingEntries: this.analysisCache.size });
    }
  }

  // ============ Helper Methods ============

  /**
     * @notice Calculate liquidity score for a trading pair
     * @param {string} pair - Trading pair
     * @param {Object} marketData - Market data context
     * @returns {number} Liquidity score (0-1)
     */
  _calculateLiquidityScore (pair, marketData) {
    const baseVolume = marketData.volume || 1000000;
    const pairMultiplier = pair.includes('BTC') ? 1.2 : pair.includes('ETH') ? 1.1 : 1.0;
    return Math.min(1, (baseVolume * pairMultiplier) / 5000000); // Normalize to 5M baseline
  }

  /**
     * @notice Get previous sentiment for momentum calculation
     * @param {string} pair - Trading pair
     * @returns {Object|null} Previous sentiment data
     */
  _getPreviousSentiment (pair) {
    // In production, this would retrieve from persistent storage
    return this.analysisCache.get(`sentiment_history_${pair}_previous`);
  }

  /**
     * @notice Store sentiment history for momentum calculations
     * @param {string} pair - Trading pair
     * @param {Object} sentiment - Current sentiment analysis
     */
  _storeSentimentHistory (pair, sentiment) {
    // Store current as previous for next calculation
    this.analysisCache.set(`sentiment_history_${pair}_previous`, {
      sentimentScore: sentiment.sentimentScore,
      timestamp: sentiment.timestamp
    });
  }

  /**
     * @notice Increase risk level by one step
     * @param {string} currentRisk - Current risk level
     * @returns {string} Increased risk level
     */
  _increaseRiskLevel (currentRisk) {
    const riskLevels = ['very_low', 'low', 'moderate', 'high', 'extreme'];
    const currentIndex = riskLevels.indexOf(currentRisk);
    return riskLevels[Math.min(currentIndex + 1, riskLevels.length - 1)];
  }

  /**
     * @notice Filter arbitrage opportunities by profitability
     * @param {Object} arbitrageAnalysis - Raw arbitrage analysis
     * @returns {Object} Filtered opportunities
     */
  _filterArbitrageOpportunities (arbitrageAnalysis) {
    try {
      const filtered = { ...arbitrageAnalysis };

      if (arbitrageAnalysis.opportunities) {
        filtered.opportunities = arbitrageAnalysis.opportunities.filter(opp =>
          opp.netProfitPercent > 0.15 && // Minimum 0.15% profit
                    opp.confidence > 0.6 && // Minimum 60% confidence
                    opp.liquidityDepth > 10000 // Minimum $10k liquidity
        );

        // Sort by profit potential
        filtered.opportunities.sort((a, b) => b.netProfitPercent - a.netProfitPercent);
      }

      return filtered;
    } catch (error) {
      this.logger.warn('⚠️ Failed to filter arbitrage opportunities', { error: error.message });
      return arbitrageAnalysis;
    }
  }

  /**
     * @notice Sleep utility for delays
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Promise that resolves after delay
     */
  _sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
     * @notice Ensure client is properly initialized
     * @dev Throws error if not initialized
     */
  _ensureInitialized () {
    if (!this.isInitialized) {
      throw new Error('GaiaClient not initialized. Call initialize() first.');
    }
  }

  // ============ Default Response Methods ============

  /**
     * @notice Get default market analysis when AI fails
     * @param {Array} tradingPairs - Trading pairs requested
     * @returns {Object} Conservative default analysis
     */
  _getDefaultMarketAnalysis (tradingPairs = []) {
    return {
      marketRegime: 'ranging',
      confidence: 0.3,
      overallTrend: 'sideways',
      volatilityLevel: 'moderate',
      riskLevel: 0.5,
      scalpingOpportunities: [],
      arbitrageOpportunities: [],
      supportResistance: {},
      newsImpact: { level: 'low', timeframe: 'unknown' },
      riskWarnings: ['AI analysis unavailable - using conservative defaults'],
      optimalPairs: tradingPairs.slice(0, 2), // Return first 2 pairs as default
      executionNotes: 'Use conservative position sizing - AI analysis failed',
      timestamp: Date.now(),
      fallback: true
    };
  }

  /**
     * @notice Get default sentiment analysis when AI fails
     * @param {string} pair - Trading pair
     * @returns {Object} Neutral default sentiment
     */
  _getDefaultSentiment (pair) {
    return {
      pair,
      sentimentScore: 0.5,
      sentiment: 'neutral',
      confidence: 0.3,
      timeframe: '5-15 minutes',
      momentumShift: 'consolidation',
      sentimentFactors: {
        social: { score: 0.5, impact: 'low', signals: ['AI analysis unavailable'] },
        news: { score: 0.5, impact: 'low', recent: 'No recent news analyzed' },
        technical: { score: 0.5, momentum: 'neutral', signals: ['Default technical state'] },
        derivatives: { score: 0.5, fundingRate: 'neutral', liquidations: 'balanced' }
      },
      keyDrivers: ['AI sentiment analysis unavailable'],
      contraindicators: ['Default neutral state'],
      tradingImpact: {
        direction: 'balanced',
        strength: 'weak',
        duration: '5-15min'
      },
      riskFactors: ['No sentiment analysis available'],
      actionable: 'Use technical analysis only - sentiment data unavailable',
      timestamp: Date.now(),
      fallback: true
    };
  }

  /**
     * @notice Get default risk assessment when AI fails
     * @returns {Object} Conservative default risk assessment
     */
  _getDefaultRiskAssessment () {
    return {
      overallRisk: 'moderate',
      riskScore: 0.6,
      confidence: 0.3,
      riskComponents: {
        volatilityRisk: { score: 0.6, level: 'moderate', impact: 'Use smaller position sizes' },
        liquidityRisk: { score: 0.5, level: 'moderate', impact: 'Monitor order book depth' },
        correlationRisk: { score: 0.5, level: 'moderate', impact: 'Diversify across pairs' },
        systemicRisk: { score: 0.5, level: 'moderate', impact: 'Standard risk protocols' }
      },
      positionSizing: {
        maxPositionPercent: 5.0,
        recommendedSize: 3.0,
        maxConcurrentPositions: 2,
        capitalAllocation: 'Conservative - AI analysis unavailable'
      },
      riskLimits: {
        stopLossPercent: 1.0,
        takeProfitPercent: 1.5,
        maxDailyDrawdown: 2.0,
        maxPositionHoldTime: '10 minutes'
      },
      recommendations: [
        'Use conservative position sizing',
        'Implement tight stop losses',
        'Monitor positions closely',
        'Avoid high-risk strategies'
      ],
      criticalWarnings: [
        'AI risk analysis unavailable - using conservative defaults'
      ],
      mitigationStrategies: [
        'Manual risk monitoring required',
        'Use technical analysis for entries',
        'Keep positions small',
        'Exit quickly on adverse moves'
      ],
      confidenceLevel: 0.3,
      timestamp: Date.now(),
      fallback: true
    };
  }

  /**
     * @notice Get default quick signal when AI fails
     * @param {string} pair - Trading pair
     * @returns {Object} Conservative hold signal
     */
  _getDefaultQuickSignal (_pair) {
    return {
      signal: 'HOLD',
      confidence: 0.3,
      strength: 'weak',
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      positionSize: 0.02,
      timeframe: '5 minutes',
      riskReward: null,
      reasoning: 'AI signal analysis unavailable - defaulting to hold',
      technicalSetup: 'Unable to analyze - manual review required',
      executionNotes: 'Wait for manual technical analysis',
      invalidationLevel: null,
      urgency: 'within_5min',
      marketConditions: 'unknown',
      timestamp: Date.now(),
      fallback: true
    };
  }

  /**
     * @notice Get default arbitrage analysis when AI fails
     * @returns {Object} Empty arbitrage analysis
     */
  _getDefaultArbitrageAnalysis () {
    return {
      opportunities: [],
      gasOptimization: {
        ethereum: { currentGwei: 25, recommendedGwei: 25, optimalTime: 'unknown' },
        polygon: { currentGwei: 35, costInUSD: 0.02 }
      },
      bridgeAnalysis: {},
      marketImpact: {
        priceImpactWarning: 'Unable to analyze market impact',
        liquidityWarnings: ['AI analysis unavailable']
      },
      executionStrategy: [
        'Manual arbitrage analysis required',
        'Monitor gas prices manually',
        'Use conservative position sizes'
      ],
      timestamp: Date.now(),
      fallback: true
    };
  }

  // ============ Public Utility Methods ============

  /**
     * @notice Check if client is connected and ready
     * @returns {boolean} Connection status
     */
  isConnected () {
    return this.isInitialized && this.httpClient;
  }

  /**
     * @notice Get current rate limit status
     * @returns {Object} Detailed rate limit information
     */
  getRateLimitStatus () {
    const now = Date.now();
    const timeSinceReset = now - this.lastWindowReset;
    const timeToReset = Math.max(0, this.requestWindow - timeSinceReset);

    return {
      requestCount: this.requestCount,
      maxRequests: this.maxRequestsPerWindow,
      remainingRequests: Math.max(0, this.maxRequestsPerWindow - this.requestCount),
      timeToReset: Math.ceil(timeToReset / 1000),
      windowDuration: this.requestWindow / 1000,
      utilizationPercent: (this.requestCount / this.maxRequestsPerWindow) * 100
    };
  }

  /**
     * @notice Get comprehensive client performance metrics
     * @returns {Object} Performance and usage statistics
     */
  getMetrics () {
    const rateLimitStatus = this.getRateLimitStatus();

    return {
      // ============ Request Metrics ============
      requests: {
        total: this.metrics.totalRequests,
        successful: this.metrics.successfulRequests,
        failed: this.metrics.failedRequests,
        successRate: this.metrics.totalRequests > 0
          ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100
          : 0
      },

      // ============ Performance Metrics ============
      performance: {
        avgResponseTime: Math.round(this.metrics.avgResponseTime),
        lastResponseTime: this.metrics.lastResponseTime,
        cacheHitRate: Math.round(this.metrics.cacheHitRate * 100)
      },

      // ============ Rate Limiting ============
      rateLimiting: rateLimitStatus,

      // ============ Cache Status ============
      cache: {
        entries: this.analysisCache.size,
        maxEntries: 200,
        utilizationPercent: (this.analysisCache.size / 200) * 100
      },

      // ============ Queue Status ============
      queue: {
        size: this.requestQueue.length,
        maxSize: this.maxQueueSize,
        isProcessing: this.isProcessingQueue
      },

      // ============ Configuration ============
      config: {
        nodeUrl: this.nodeUrl,
        primaryModel: this.modelConfig.primary.name,
        fastModel: this.modelConfig.fast.name,
        cacheTimeout: this.cacheTimeout / 1000,
        isInitialized: this.isInitialized
      },

      timestamp: Date.now()
    };
  }

  /**
     * @notice Update rate limiting configuration
     * @param {Object} config - New rate limit configuration
     */
  updateRateLimits (config) {
    if (config.maxRequestsPerWindow && config.maxRequestsPerWindow > 0) {
      this.maxRequestsPerWindow = config.maxRequestsPerWindow;
      this.logger.info('📊 Max requests per window updated', {
        newLimit: this.maxRequestsPerWindow
      });
    }

    if (config.requestWindow && config.requestWindow > 0) {
      this.requestWindow = config.requestWindow;
      this.logger.info('⏱️ Request window updated', {
        newWindow: `${this.requestWindow / 1000}s`
      });
    }

    if (config.cacheTimeout && config.cacheTimeout > 0) {
      this.cacheTimeout = config.cacheTimeout;
      this.logger.info('🗂️ Cache timeout updated', {
        newTimeout: `${this.cacheTimeout / 1000}s`
      });
    }
  }

  /**
     * @notice Update model configuration
     * @param {Object} modelConfig - New model configuration
     */
  updateModelConfig (modelConfig) {
    if (modelConfig.primary) {
      Object.assign(this.modelConfig.primary, modelConfig.primary);
      this.logger.info('🤖 Primary model config updated', {
        model: this.modelConfig.primary.name
      });
    }

    if (modelConfig.fast) {
      Object.assign(this.modelConfig.fast, modelConfig.fast);
      this.logger.info('⚡ Fast model config updated', {
        model: this.modelConfig.fast.name
      });
    }
  }

  /**
     * @notice Clear all caches and reset metrics
     */
  clearCache () {
    this.analysisCache.clear();
    this.logger.info('🧹 Analysis cache cleared', {
      previousSize: this.analysisCache.size
    });
  }

  /**
     * @notice Reset performance metrics
     */
  resetMetrics () {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      lastResponseTime: 0
    };

    this.logger.info('📊 Performance metrics reset');
  }

  /**
     * @notice Gracefully shutdown the client
     * @dev Stops queue processing and clears resources
     */
  async shutdown () {
    this.logger.info('🛑 Shutting down GaiaClient...');

    // ============ Stop Queue Processing ============
    this.isProcessingQueue = false;

    // ============ Clear Pending Requests ============
    while (this.requestQueue.length > 0) {
      const { reject } = this.requestQueue.shift();
      reject(new Error('Client shutting down'));
    }

    // ============ Clear Cache ============
    this.analysisCache.clear();

    // ============ Reset State ============
    this.isInitialized = false;

    this.logger.info('✅ GaiaClient shutdown complete');
  }

  /**
     * @notice Get client health status
     * @returns {Object} Comprehensive health check
     */
  /**
   * @notice Get available models from the Gaia service
   * @return {Array} List of available models
   */
  async getModels () {
    try {
      return [this.model, this.embeddingModel];
    } catch (error) {
      this.logger.error('Failed to get models', { error: error.message });
      return [];
    }
  }

  async getHealthStatus () {
    const health = {
      status: 'unknown',
      timestamp: Date.now(),
      checks: {}
    };

    try {
      // ============ Initialization Check ============
      health.checks.initialized = {
        status: this.isInitialized ? 'pass' : 'fail',
        message: this.isInitialized ? 'Client initialized' : 'Client not initialized'
      };

      // ============ Connection Check ============
      if (this.isInitialized) {
        try {
          await this._testConnection();
          health.checks.connectivity = {
            status: 'pass',
            message: 'Gaia node reachable',
            responseTime: this.metrics.lastResponseTime
          };
        } catch (error) {
          health.checks.connectivity = {
            status: 'fail',
            message: `Connection failed: ${error.message}`
          };
        }
      }

      // ============ Rate Limit Check ============
      const rateLimitStatus = this.getRateLimitStatus();
      health.checks.rateLimiting = {
        status: rateLimitStatus.remainingRequests > 5 ? 'pass' : 'warn',
        message: `${rateLimitStatus.remainingRequests} requests remaining`,
        details: rateLimitStatus
      };

      // ============ Performance Check ============
      const successRate = this.metrics.totalRequests > 0
        ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100
        : 100;

      health.checks.performance = {
        status: successRate > 90 ? 'pass' : successRate > 70 ? 'warn' : 'fail',
        message: `${successRate.toFixed(1)}% success rate`,
        avgResponseTime: this.metrics.avgResponseTime
      };

      // ============ Overall Status ============
      const allChecks = Object.values(health.checks);
      const hasFailures = allChecks.some(check => check.status === 'fail');
      const hasWarnings = allChecks.some(check => check.status === 'warn');

      if (hasFailures) {
        health.status = 'unhealthy';
      } else if (hasWarnings) {
        health.status = 'degraded';
      } else {
        health.status = 'healthy';
      }

      return health;
    } catch (error) {
      health.status = 'error';
      health.error = error.message;
      return health;
    }
  }

  /**
   * @notice Simple ping to check Gaia node latency and connectivity
   * @dev Tests connection and returns response time
   * @returns {Object} Ping result with latency and status
   */
  async ping () {
    try {
      const startTime = Date.now();
      await this._testConnection();
      const latency = Date.now() - startTime;

      return {
        status: 'success',
        latency,
        timestamp: Date.now(),
        nodeUrl: this.nodeUrl
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        latency: null,
        timestamp: Date.now(),
        nodeUrl: this.nodeUrl
      };
    }
  }

  /**
   * @notice Disconnect and cleanup Gaia client
   * @dev Stops all intervals and clears queues
   */
  async disconnect () {
    try {
      // ============ Clear Request Queue ============
      this.requestQueue.length = 0;

      // ============ Clear Cache ============
      this.cache.clear();

      // ============ Reset State ============
      this.isConnected = false;
      this.isInitialized = false;

      this.logger.info('Gaia client disconnected successfully');
    } catch (error) {
      this.logger.error('Failed to disconnect Gaia client', { error: error.message });
      throw error;
    }
  }
}

export default GaiaClient;
