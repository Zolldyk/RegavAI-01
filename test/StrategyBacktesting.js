// ============ Imports ============
import { jest } from '@jest/globals';
import { TradingStrategy } from '../src/core/TradingStrategy.js';
import { TechnicalIndicators } from '../src/analytics/TechnicalIndicators.js';
import { Logger } from '../src/utils/Logger.js';
import fs from 'fs/promises';
import path from 'path';

// ============ Backtesting Configuration ============
const BACKTEST_CONFIG = {
    // ============ Time Periods ============
    SIMULATION_DURATION: 3600000, // 1 hour in milliseconds (competition duration)
    TICK_INTERVAL: 1000, // 1 second ticks
    DATA_INTERVALS: ['1s', '5s', '15s', '1m', '5m'],
    
    // ============ Market Scenarios ============
    MARKET_SCENARIOS: {
        TRENDING_BULL: 'trending_bull',
        TRENDING_BEAR: 'trending_bear',
        HIGH_VOLATILITY: 'high_volatility',
        LOW_VOLATILITY: 'low_volatility',
        SIDEWAYS_CHOPPY: 'sideways_choppy',
        NEWS_DRIVEN: 'news_driven',
        FLASH_CRASH: 'flash_crash',
        RECOVERY_BOUNCE: 'recovery_bounce'
    },
    
    // ============ Performance Metrics ============
    BENCHMARK_METRICS: {
        MIN_WIN_RATE: 0.55,
        MIN_PROFIT_FACTOR: 1.8,
        MAX_DRAWDOWN: 5.0,
        MIN_SHARPE_RATIO: 1.2,
        MIN_TRADES_PER_HOUR: 15,
        TARGET_HOURLY_RETURN: 2.0 // 2% per hour target
    },
    
    // ============ Trading Pairs for Backtesting ============
    TRADING_PAIRS: ['BTC/USDT', 'ETH/USDT', 'SOL/USDC'],
    
    // ============ Initial Capital ============
    INITIAL_CAPITAL: 10000 // $10,000 starting capital
};

// ============ Historical Market Data Generator ============
class MarketDataGenerator {
    constructor(scenario, duration, tickInterval) {
        this.scenario = scenario;
        this.duration = duration;
        this.tickInterval = tickInterval;
        this.currentTime = 0;
        this.basePrice = 50000;
        this.logger = new Logger('MarketDataGenerator');
    }

    /**
     * @notice Generate complete historical dataset for backtesting
     * @returns {Object} Generated market data with multiple timeframes
     */
    generateHistoricalData() {
        const data = {
            priceData: new Map(),
            volumeData: new Map(),
            orderBookData: new Map(),
            sentimentData: new Map(),
            newsEvents: []
        };

        const totalTicks = Math.floor(this.duration / this.tickInterval);
        this.logger.info(`Generating ${totalTicks} ticks for ${this.scenario} scenario`);

        // ============ Generate Base Price Series ============
        const priceSeries = this._generatePriceSeries(totalTicks);
        
        // ============ Generate Volume Series ============
        const volumeSeries = this._generateVolumeSeries(totalTicks, priceSeries);
        
        // ============ Generate Order Book Data ============
        const orderBookSeries = this._generateOrderBookSeries(totalTicks, priceSeries);
        
        // ============ Generate Sentiment Data ============
        const sentimentSeries = this._generateSentimentSeries(totalTicks, priceSeries);
        
        // ============ Generate News Events ============
        const newsEvents = this._generateNewsEvents(totalTicks);

        // ============ Structure Data by Trading Pairs ============
        for (const pair of BACKTEST_CONFIG.TRADING_PAIRS) {
            data.priceData.set(pair, this._createMultiTimeframeData(priceSeries, volumeSeries));
            data.volumeData.set(pair, volumeSeries);
            data.orderBookData.set(pair, orderBookSeries);
            data.sentimentData.set(pair, sentimentSeries);
        }

        data.newsEvents = newsEvents;
        
        this.logger.info('Historical data generation completed');
        return data;
    }

    /**
     * @notice Generate price series based on market scenario
     * @param {number} totalTicks - Total number of price ticks
     * @returns {Array} Array of price data points
     */
    _generatePriceSeries(totalTicks) {
        const prices = [];
        let currentPrice = this.basePrice;
        let trend = 0;
        let volatility = 0.001; // Base volatility
        
        // ============ Set Scenario Parameters ============
        switch (this.scenario) {
            case BACKTEST_CONFIG.MARKET_SCENARIOS.TRENDING_BULL:
                trend = 0.0002; // Strong upward trend
                volatility = 0.002;
                break;
            case BACKTEST_CONFIG.MARKET_SCENARIOS.TRENDING_BEAR:
                trend = -0.0002; // Strong downward trend
                volatility = 0.0025;
                break;
            case BACKTEST_CONFIG.MARKET_SCENARIOS.HIGH_VOLATILITY:
                trend = 0;
                volatility = 0.008; // Very high volatility
                break;
            case BACKTEST_CONFIG.MARKET_SCENARIOS.LOW_VOLATILITY:
                trend = 0;
                volatility = 0.0005; // Very low volatility
                break;
            case BACKTEST_CONFIG.MARKET_SCENARIOS.SIDEWAYS_CHOPPY:
                trend = 0;
                volatility = 0.003;
                break;
            case BACKTEST_CONFIG.MARKET_SCENARIOS.NEWS_DRIVEN:
                trend = 0.0001;
                volatility = 0.004;
                break;
            case BACKTEST_CONFIG.MARKET_SCENARIOS.FLASH_CRASH:
                trend = 0;
                volatility = 0.002;
                break;
            case BACKTEST_CONFIG.MARKET_SCENARIOS.RECOVERY_BOUNCE:
                trend = 0.0003; // Strong recovery
                volatility = 0.006;
                break;
        }

        // ============ Generate Price Points ============
        for (let i = 0; i < totalTicks; i++) {
            const timeProgress = i / totalTicks;
            
            // ============ Apply Scenario-Specific Patterns ============
            let scenarioAdjustment = 0;
            
            if (this.scenario === BACKTEST_CONFIG.MARKET_SCENARIOS.FLASH_CRASH && timeProgress > 0.3 && timeProgress < 0.5) {
                scenarioAdjustment = -0.08 * Math.sin((timeProgress - 0.3) * Math.PI / 0.2); // 8% flash crash
            } else if (this.scenario === BACKTEST_CONFIG.MARKET_SCENARIOS.NEWS_DRIVEN) {
                // Random news spikes
                if (Math.random() < 0.01) {
                    scenarioAdjustment = (Math.random() - 0.5) * 0.04; // 2% news impact
                }
            } else if (this.scenario === BACKTEST_CONFIG.MARKET_SCENARIOS.SIDEWAYS_CHOPPY) {
                // Create choppy sideways movement
                scenarioAdjustment = Math.sin(timeProgress * 20) * 0.01;
            }

            // ============ Calculate Price Change ============
            const randomComponent = (Math.random() - 0.5) * volatility * 2;
            const trendComponent = trend;
            const totalChange = randomComponent + trendComponent + scenarioAdjustment;
            
            currentPrice *= (1 + totalChange);
            
            // ============ Add Realistic Price Constraints ============
            if (currentPrice < this.basePrice * 0.7) currentPrice = this.basePrice * 0.7; // Max 30% drop
            if (currentPrice > this.basePrice * 1.5) currentPrice = this.basePrice * 1.5; // Max 50% gain
            
            prices.push({
                timestamp: this.currentTime + (i * this.tickInterval),
                price: currentPrice,
                change: totalChange,
                volume: this._calculateVolumeForPrice(currentPrice, totalChange)
            });
        }

        return prices;
    }

    /**
     * @notice Generate volume series correlated with price movements
     * @param {number} totalTicks - Total number of ticks
     * @param {Array} priceSeries - Price series data
     * @returns {Array} Volume series data
     */
    _generateVolumeSeries(totalTicks, priceSeries) {
        const volumes = [];
        const baseVolume = 1000000; // 1M base volume

        for (let i = 0; i < totalTicks; i++) {
            const priceData = priceSeries[i];
            const priceChangeAbs = Math.abs(priceData.change);
            
            // ============ Volume increases with price volatility ============
            const volatilityMultiplier = 1 + (priceChangeAbs * 50);
            
            // ============ Add time-of-day effects ============
            const hourOfDay = Math.floor((i * this.tickInterval) / (1000 * 60 * 60)) % 24;
            const timeMultiplier = this._getTimeOfDayVolumeMultiplier(hourOfDay);
            
            // ============ Add random component ============
            const randomMultiplier = 0.7 + (Math.random() * 0.6); // 0.7x to 1.3x
            
            const finalVolume = baseVolume * volatilityMultiplier * timeMultiplier * randomMultiplier;
            
            volumes.push({
                timestamp: priceData.timestamp,
                volume: Math.floor(finalVolume),
                buyVolume: Math.floor(finalVolume * (0.45 + Math.random() * 0.1)), // 45-55% buy volume
                sellVolume: Math.floor(finalVolume * (0.45 + Math.random() * 0.1))
            });
        }

        return volumes;
    }

    /**
     * @notice Generate order book data series
     * @param {number} totalTicks - Total number of ticks
     * @param {Array} priceSeries - Price series data
     * @returns {Array} Order book series data
     */
    _generateOrderBookSeries(totalTicks, priceSeries) {
        const orderBooks = [];

        for (let i = 0; i < totalTicks; i++) {
            const priceData = priceSeries[i];
            const currentPrice = priceData.price;
            
            // ============ Generate Bid/Ask Levels ============
            const spread = currentPrice * (0.0001 + Math.random() * 0.0004); // 0.01-0.05% spread
            const bidPrice = currentPrice - (spread / 2);
            const askPrice = currentPrice + (spread / 2);
            
            // ============ Generate Order Book Depth ============
            const bidVolume = 800000 + Math.random() * 400000;
            const askVolume = 800000 + Math.random() * 400000;
            
            // ============ Calculate Order Book Metrics ============
            const imbalance = (bidVolume - askVolume) / (bidVolume + askVolume);
            const spreadTightness = 1 - (spread / currentPrice);
            
            // ============ Generate Large Orders ============
            const largeOrders = this._generateLargeOrders(currentPrice, bidPrice, askPrice);
            
            orderBooks.push({
                timestamp: priceData.timestamp,
                bidPrice,
                askPrice,
                bidVolume,
                askVolume,
                spread,
                imbalance,
                spreadTightness,
                largeOrders,
                midPrice: (bidPrice + askPrice) / 2
            });
        }

        return orderBooks;
    }

    /**
     * @notice Generate sentiment data series
     * @param {number} totalTicks - Total number of ticks
     * @param {Array} priceSeries - Price series data
     * @returns {Array} Sentiment series data
     */
    _generateSentimentSeries(totalTicks, priceSeries) {
        const sentiments = [];
        let currentSentiment = 0.5; // Neutral starting sentiment

        for (let i = 0; i < totalTicks; i++) {
            const priceData = priceSeries[i];
            
            // ============ Sentiment follows price with lag ============
            const priceChange = priceData.change;
            const sentimentChange = priceChange * 200; // Amplified sentiment response
            
            // ============ Apply Momentum and Mean Reversion ============
            currentSentiment += sentimentChange * 0.1; // Momentum
            currentSentiment = currentSentiment * 0.95 + 0.5 * 0.05; // Mean reversion to neutral
            
            // ============ Add Noise ============
            currentSentiment += (Math.random() - 0.5) * 0.05;
            
            // ============ Constrain to [0, 1] ============
            currentSentiment = Math.max(0, Math.min(1, currentSentiment));
            
            // ============ Generate Sentiment Components ============
            sentiments.push({
                timestamp: priceData.timestamp,
                score: currentSentiment,
                newsImpact: this._generateNewsImpact(),
                socialMomentum: this._generateSocialMomentum(currentSentiment),
                fearGreedIndex: this._generateFearGreedIndex(currentSentiment),
                confidence: 0.6 + Math.random() * 0.3 // 60-90% confidence
            });
        }

        return sentiments;
    }

    /**
     * @notice Generate news events throughout the simulation
     * @param {number} totalTicks - Total number of ticks
     * @returns {Array} News events data
     */
    _generateNewsEvents(totalTicks) {
        const events = [];
        const eventsPerHour = 5; // Average 5 news events per hour
        const eventProbability = eventsPerHour / (3600 / (this.tickInterval / 1000));

        for (let i = 0; i < totalTicks; i++) {
            if (Math.random() < eventProbability) {
                const event = {
                    timestamp: this.currentTime + (i * this.tickInterval),
                    type: this._getRandomNewsType(),
                    impact: (Math.random() - 0.5) * 0.02, // ±1% impact
                    duration: 60000 + Math.random() * 300000, // 1-6 minutes duration
                    confidence: 0.5 + Math.random() * 0.4
                };
                events.push(event);
            }
        }

        return events;
    }

    /**
     * @notice Create multi-timeframe data structure
     * @param {Array} priceSeries - Price series data
     * @param {Array} volumeSeries - Volume series data
     * @returns {Object} Multi-timeframe data
     */
    _createMultiTimeframeData(priceSeries, volumeSeries) {
        const multiTimeframe = {};
        
        for (const interval of BACKTEST_CONFIG.DATA_INTERVALS) {
            const intervalMs = this._parseInterval(interval);
            multiTimeframe[interval] = this._aggregateToTimeframe(priceSeries, volumeSeries, intervalMs);
        }
        
        return multiTimeframe;
    }

    // ============ Helper Methods ============
    
    _calculateVolumeForPrice(price, change) {
        return 1000000 * (1 + Math.abs(change) * 10) * (0.8 + Math.random() * 0.4);
    }

    _getTimeOfDayVolumeMultiplier(hour) {
        // Simulate trading activity patterns
        if (hour >= 8 && hour <= 16) return 1.5; // High activity during trading hours
        if (hour >= 0 && hour <= 6) return 0.6;  // Low activity during night
        return 1.0; // Normal activity
    }

    _generateLargeOrders(currentPrice, bidPrice, askPrice) {
        const orders = [];
        const numOrders = Math.floor(Math.random() * 4); // 0-3 large orders

        for (let i = 0; i < numOrders; i++) {
            orders.push({
                side: Math.random() > 0.5 ? 'BUY' : 'SELL',
                size: 100000 + Math.random() * 400000,
                price: Math.random() > 0.5 ? 
                    bidPrice - (Math.random() * currentPrice * 0.001) : 
                    askPrice + (Math.random() * currentPrice * 0.001)
            });
        }

        return orders;
    }

    _generateNewsImpact() {
        const impacts = ['POSITIVE', 'NEGATIVE', 'NEUTRAL'];
        return impacts[Math.floor(Math.random() * impacts.length)];
    }

    _generateSocialMomentum(sentiment) {
        const momentums = ['STRONG', 'MODERATE', 'WEAK'];
        const index = sentiment > 0.7 ? 0 : sentiment < 0.3 ? 2 : 1;
        return momentums[index];
    }

    _generateFearGreedIndex(sentiment) {
        return Math.round(sentiment * 100);
    }

    _getRandomNewsType() {
        const types = ['REGULATORY', 'ADOPTION', 'TECHNICAL', 'MARKET', 'PARTNERSHIP'];
        return types[Math.floor(Math.random() * types.length)];
    }

    _parseInterval(interval) {
        const unit = interval.slice(-1);
        const value = parseInt(interval.slice(0, -1));
        
        switch (unit) {
            case 's': return value * 1000;
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            default: return 1000;
        }
    }

    _aggregateToTimeframe(priceSeries, volumeSeries, intervalMs) {
        const aggregated = [];
        let currentBucket = null;

        for (let i = 0; i < priceSeries.length; i++) {
            const pricePoint = priceSeries[i];
            const volumePoint = volumeSeries[i];
            const bucketStart = Math.floor(pricePoint.timestamp / intervalMs) * intervalMs;

            if (!currentBucket || currentBucket.timestamp !== bucketStart) {
                if (currentBucket) {
                    aggregated.push(this._finalizeBucket(currentBucket));
                }
                currentBucket = {
                    timestamp: bucketStart,
                    open: pricePoint.price,
                    high: pricePoint.price,
                    low: pricePoint.price,
                    close: pricePoint.price,
                    volume: 0,
                    trades: 0
                };
            }

            // Update OHLC
            currentBucket.high = Math.max(currentBucket.high, pricePoint.price);
            currentBucket.low = Math.min(currentBucket.low, pricePoint.price);
            currentBucket.close = pricePoint.price;
            currentBucket.volume += volumePoint.volume;
            currentBucket.trades++;
        }

        if (currentBucket) {
            aggregated.push(this._finalizeBucket(currentBucket));
        }

        return aggregated;
    }

    _finalizeBucket(bucket) {
        return {
            ...bucket,
            price: bucket.close,
            change: (bucket.close - bucket.open) / bucket.open,
            priceRange: bucket.high - bucket.low,
            avgPrice: (bucket.open + bucket.high + bucket.low + bucket.close) / 4
        };
    }
}

// ============ Strategy Backtesting Engine ============
class StrategyBacktester {
    constructor(strategy, marketData, config = {}) {
        this.strategy = strategy;
        this.marketData = marketData;
        this.config = { ...BACKTEST_CONFIG, ...config };
        this.logger = new Logger('StrategyBacktester');
        
        // ============ Backtesting State ============
        this.currentTime = 0;
        this.currentTick = 0;
        this.results = {
            trades: [],
            performance: {},
            metrics: {},
            timeline: [],
            errors: []
        };
        
        // ============ Portfolio Tracking ============
        this.portfolio = {
            cash: this.config.INITIAL_CAPITAL,
            positions: new Map(),
            totalValue: this.config.INITIAL_CAPITAL,
            maxValue: this.config.INITIAL_CAPITAL,
            minValue: this.config.INITIAL_CAPITAL
        };
    }

    /**
     * @notice Run complete backtesting simulation
     * @returns {Object} Comprehensive backtesting results
     */
    async runBacktest() {
        this.logger.info('Starting strategy backtesting simulation', {
            duration: this.config.SIMULATION_DURATION,
            scenario: this.marketData.scenario,
            initialCapital: this.config.INITIAL_CAPITAL
        });

        try {
            // ============ Initialize Strategy for Backtesting ============
            await this._initializeStrategyForBacktest();
            
            // ============ Run Main Simulation Loop ============
            await this._runSimulationLoop();
            
            // ============ Calculate Final Results ============
            this._calculateFinalResults();
            
            // ============ Generate Performance Report ============
            const report = this._generatePerformanceReport();
            
            this.logger.info('Backtesting simulation completed', {
                totalTrades: this.results.trades.length,
                finalCapital: this.portfolio.totalValue,
                return: ((this.portfolio.totalValue / this.config.INITIAL_CAPITAL) - 1) * 100
            });
            
            return report;
            
        } catch (error) {
            this.logger.error('Backtesting simulation failed', { error: error.message });
            throw error;
        }
    }

    /**
     * @notice Initialize strategy with backtesting configuration
     */
    async _initializeStrategyForBacktest() {
        // ============ Override Strategy Methods for Backtesting ============
        this.strategy._getMultiTimeframeData = this._createMarketDataProvider();
        this.strategy._analyzeOrderBook = this._createOrderBookProvider();
        this.strategy._getAdvancedSentimentAnalysis = this._createSentimentProvider();
        
        // ============ Mock External Service Calls ============
        this.strategy._getEnhancedMarketAnalysis = this._createMarketAnalysisProvider();
        this.strategy._getMachineLearningPrediction = this._createMLPredictionProvider();
        
        // ============ Override Trade Execution ============
        this.strategy._executeEnhancedVincentTrade = this._createTradeExecutor();
        
        // ============ Disable Real-Time Dependencies ============
        this.strategy._storeAnalysis = jest.fn().mockResolvedValue(true);
        this.strategy._scanArbitrageOpportunities = jest.fn().mockResolvedValue(true);
        
        this.logger.info('Strategy initialized for backtesting');
    }

    /**
     * @notice Run the main simulation loop
     */
    async _runSimulationLoop() {
        const totalTicks = Math.floor(this.config.SIMULATION_DURATION / this.config.TICK_INTERVAL);
        
        for (this.currentTick = 0; this.currentTick < totalTicks; this.currentTick++) {
            this.currentTime = this.currentTick * this.config.TICK_INTERVAL;
            
            try {
                // ============ Update Market State ============
                this._updateMarketState();
                
                // ============ Process Strategy Logic ============
                await this._processStrategyTick();
                
                // ============ Update Portfolio Values ============
                this._updatePortfolioValues();
                
                // ============ Record Timeline Data ============
                this._recordTimelineData();
                
                // ============ Progress Reporting ============
                if (this.currentTick % 600 === 0) { // Every 10 minutes
                    this._logProgress();
                }
                
            } catch (error) {
                this.results.errors.push({
                    timestamp: this.currentTime,
                    tick: this.currentTick,
                    error: error.message
                });
                this.logger.warn('Error during simulation tick', { 
                    tick: this.currentTick, 
                    error: error.message 
                });
            }
        }
    }

    /**
     * @notice Process single strategy tick
     */
    async _processStrategyTick() {
        // ============ Process Each Trading Pair ============
        for (const pair of this.config.TRADING_PAIRS) {
            try {
                // ============ Get Current Market Data ============
                const marketData = await this.strategy._getMultiTimeframeData(pair);
                const enhancedAnalysis = await this.strategy._getEnhancedMarketAnalysis();
                
                // ============ Process Trading Logic ============
                await this.strategy._processEnhancedTradingPair(pair, enhancedAnalysis);
                
            } catch (error) {
                this.logger.debug(`Error processing pair ${pair}`, { error: error.message });
            }
        }
        
        // ============ Manage Existing Positions ============
        await this.strategy._managePositionsAdvanced();
        
        // ============ Update Performance Metrics ============
        this.strategy._updateEnhancedPerformanceMetrics();
    }

    /**
     * @notice Create market data provider for backtesting
     * @returns {Function} Market data provider function
     */
    _createMarketDataProvider() {
        return (pair) => {
            const pairData = this.marketData.priceData.get(pair);
            if (!pairData) return {};
            
            const result = {};
            for (const [interval, data] of Object.entries(pairData)) {
                const tickIndex = this._getTickIndexForInterval(interval);
                if (tickIndex < data.length) {
                    result[interval] = data[tickIndex];
                }
            }
            return result;
        };
    }

    /**
     * @notice Create order book data provider
     * @returns {Function} Order book provider function
     */
    _createOrderBookProvider() {
        return (pair) => {
            const orderBookData = this.marketData.orderBookData.get(pair);
            if (!orderBookData || this.currentTick >= orderBookData.length) {
                return this._getDefaultOrderBook();
            }
            return orderBookData[this.currentTick];
        };
    }

    /**
     * @notice Create sentiment data provider
     * @returns {Function} Sentiment provider function
     */
    _createSentimentProvider() {
        return (pair) => {
            const sentimentData = this.marketData.sentimentData.get(pair);
            if (!sentimentData || this.currentTick >= sentimentData.length) {
                return { score: 0.5, newsImpact: 'NEUTRAL', socialMomentum: 'MODERATE' };
            }
            return sentimentData[this.currentTick];
        };
    }

    /**
     * @notice Create market analysis provider
     * @returns {Function} Market analysis provider function
     */
    _createMarketAnalysisProvider() {
        return async () => {
            // ============ Analyze Current Market Conditions ============
            const currentPrices = {};
            for (const pair of this.config.TRADING_PAIRS) {
                const pairData = this.marketData.priceData.get(pair);
                if (pairData && pairData['1m'] && this.currentTick < pairData['1m'].length) {
                    currentPrices[pair] = pairData['1m'][this.currentTick];
                }
            }
            
            // ============ Determine Market Regime ============
            const regime = this._determineMarketRegime(currentPrices);
            
            return {
                trend: regime.trend,
                volatility: regime.volatility,
                confidence: regime.confidence,
                timestamp: this.currentTime,
                marketRegime: regime.type,
                riskLevel: regime.riskLevel,
                reasoning: `Backtested analysis for ${regime.type} market`
            };
        };
    }

    /**
     * @notice Create ML prediction provider
     * @returns {Function} ML prediction provider function
     */
    _createMLPredictionProvider() {
        return async (pair, features) => {
            // ============ Simple ML Simulation Based on Features ============
            let confidence = 0.5;
            let direction = 'SIDEWAYS';
            
            // ============ Analyze Technical Features ============
            if (features.indicators && features.indicators.rsi) {
                const rsi = features.indicators.rsi['1m'] || 50;
                if (rsi < 30) {
                    direction = 'UP';
                    confidence = Math.min(0.9, 0.6 + (30 - rsi) / 30 * 0.3);
                } else if (rsi > 70) {
                    direction = 'DOWN';
                    confidence = Math.min(0.9, 0.6 + (rsi - 70) / 30 * 0.3);
                }
            }
            
            // ============ Analyze Sentiment ============
            if (features.sentiment) {
                const sentimentScore = features.sentiment.score;
                if (sentimentScore > 0.7 && direction !== 'DOWN') {
                    direction = 'UP';
                    confidence = Math.min(0.95, confidence + 0.1);
                } else if (sentimentScore < 0.3 && direction !== 'UP') {
                    direction = 'DOWN';
                    confidence = Math.min(0.95, confidence + 0.1);
                }
            }
            
            return {
                direction,
                confidence,
                timeHorizon: '1-5 minutes',
                magnitude: `${(confidence * 2).toFixed(1)}%`,
                riskFactors: ['backtesting_simulation'],
                supportingEvidence: 'Simulated ML prediction based on technical and sentiment features'
            };
        };
    }

    /**
     * @notice Create trade executor for backtesting
     * @returns {Function} Trade executor function
     */
    _createTradeExecutor() {
        return async (tradeParams) => {
            try {
                // ============ Execute Simulated Trade ============
                const trade = await this._executeSimulatedTrade(tradeParams);
                
                // ============ Record Trade ============
                this.results.trades.push(trade);
                
                // ============ Update Portfolio ============
                this._updatePortfolioFromTrade(trade);
                
                return {
                    success: true,
                    result: {
                        transactionHash: `0xbacktest${this.currentTick}${Date.now()}`,
                        trade
                    }
                };
                
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        };
    }

    /**
     * @notice Execute simulated trade
     * @param {Object} tradeParams - Trade parameters
     * @returns {Object} Trade execution result
     */
    async _executeSimulatedTrade(tradeParams) {
        const { pair, action, amount, confidence } = tradeParams;
        
        // ============ Get Current Market Price ============
        const marketData = this.marketData.priceData.get(pair);
        const currentCandle = marketData['1s'][this.currentTick] || marketData['5s'][this.currentTick] || marketData['1m'][this.currentTick];
        
        if (!currentCandle) {
            throw new Error(`No market data available for ${pair} at tick ${this.currentTick}`);
        }
        
        const currentPrice = currentCandle.price;
        
        // ============ Calculate Trade Execution Details ============
        const slippage = this._calculateSlippage(amount, currentCandle.volume);
        const executionPrice = action === 'BUY' ? 
            currentPrice * (1 + slippage) : 
            currentPrice * (1 - slippage);
        
        const tradingFee = amount * 0.001; // 0.1% trading fee
        const netAmount = action === 'BUY' ? amount + tradingFee : amount - tradingFee;
        
        // ============ Validate Trade ============
        if (action === 'BUY' && netAmount > this.portfolio.cash) {
            throw new Error('Insufficient cash for buy order');
        }
        
        const position = this.portfolio.positions.get(pair);
        if (action === 'SELL' && (!position || position.quantity < netAmount)) {
            throw new Error('Insufficient position for sell order');
        }
        
        // ============ Create Trade Record ============
        const trade = {
            timestamp: this.currentTime,
            tick: this.currentTick,
            pair,
            action,
            amount,
            price: executionPrice,
            confidence,
            slippage,
            fee: tradingFee,
            netAmount,
            strategy: 'enhanced_scalping',
            marketConditions: this._getCurrentMarketConditions()
        };
        
        return trade;
    }

    /**
     * @notice Update portfolio from executed trade
     * @param {Object} trade - Executed trade
     */
    _updatePortfolioFromTrade(trade) {
        const { pair, action, netAmount, price } = trade;
        
        if (action === 'BUY') {
            // ============ Update Cash ============
            this.portfolio.cash -= netAmount;
            
            // ============ Update Position ============
            const currentPosition = this.portfolio.positions.get(pair) || { quantity: 0, avgPrice: 0, totalCost: 0 };
            const newQuantity = currentPosition.quantity + (netAmount / price);
            const newTotalCost = currentPosition.totalCost + netAmount;
            const newAvgPrice = newTotalCost / newQuantity;
            
            this.portfolio.positions.set(pair, {
                quantity: newQuantity,
                avgPrice: newAvgPrice,
                totalCost: newTotalCost,
                lastUpdate: this.currentTime
            });
            
        } else { // SELL
            // ============ Update Cash ============
            this.portfolio.cash += netAmount;
            
            // ============ Update Position ============
            const currentPosition = this.portfolio.positions.get(pair);
            if (currentPosition) {
                const sellQuantity = netAmount / price;
                const newQuantity = currentPosition.quantity - sellQuantity;
                const costBasis = (sellQuantity / currentPosition.quantity) * currentPosition.totalCost;
                
                if (newQuantity <= 0) {
                    this.portfolio.positions.delete(pair);
                } else {
                    currentPosition.quantity = newQuantity;
                    currentPosition.totalCost -= costBasis;
                    currentPosition.lastUpdate = this.currentTime;
                }
            }
        }
    }

    /**
     * @notice Update portfolio values based on current market prices
     */
    _updatePortfolioValues() {
        let totalPositionValue = 0;
        
        // ============ Calculate Position Values ============
        for (const [pair, position] of this.portfolio.positions) {
            const marketData = this.marketData.priceData.get(pair);
            const currentCandle = marketData['1s'][this.currentTick] || marketData['1m'][this.currentTick];
            
            if (currentCandle) {
                const positionValue = position.quantity * currentCandle.price;
                totalPositionValue += positionValue;
            }
        }
        
        // ============ Update Total Portfolio Value ============
        this.portfolio.totalValue = this.portfolio.cash + totalPositionValue;
        this.portfolio.maxValue = Math.max(this.portfolio.maxValue, this.portfolio.totalValue);
        this.portfolio.minValue = Math.min(this.portfolio.minValue, this.portfolio.totalValue);
    }

    /**
     * @notice Record timeline data for analysis
     */
    _recordTimelineData() {
        if (this.currentTick % 60 === 0) { // Record every minute
            this.results.timeline.push({
                timestamp: this.currentTime,
                tick: this.currentTick,
                portfolioValue: this.portfolio.totalValue,
                cash: this.portfolio.cash,
                positionsValue: this.portfolio.totalValue - this.portfolio.cash,
                positionsCount: this.portfolio.positions.size,
                marketConditions: this._getCurrentMarketConditions()
            });
        }
    }

    /**
     * @notice Calculate final backtesting results
     */
    _calculateFinalResults() {
        const totalReturn = ((this.portfolio.totalValue / this.config.INITIAL_CAPITAL) - 1) * 100;
        const maxDrawdown = ((this.portfolio.maxValue - this.portfolio.minValue) / this.portfolio.maxValue) * 100;
        
        // ============ Separate Winning and Losing Trades ============
        const winningTrades = this.results.trades.filter(trade => {
            const position = this.portfolio.positions.get(trade.pair);
            return this._calculateTradePnL(trade, position) > 0;
        });
        
        const losingTrades = this.results.trades.filter(trade => {
            const position = this.portfolio.positions.get(trade.pair);
            return this._calculateTradePnL(trade, position) <= 0;
        });
        
        // ============ Calculate Performance Metrics ============
        const winRate = this.results.trades.length > 0 ? winningTrades.length / this.results.trades.length : 0;
        
        const totalWins = winningTrades.reduce((sum, trade) => {
            const position = this.portfolio.positions.get(trade.pair);
            return sum + this._calculateTradePnL(trade, position);
        }, 0);
        
        const totalLosses = Math.abs(losingTrades.reduce((sum, trade) => {
            const position = this.portfolio.positions.get(trade.pair);
            return sum + this._calculateTradePnL(trade, position);
        }, 0));
        
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 10 : 1;
        
        // ============ Calculate Time-Based Metrics ============
        const durationHours = this.config.SIMULATION_DURATION / (1000 * 60 * 60);
        const tradesPerHour = this.results.trades.length / durationHours;
        const hourlyReturn = totalReturn / durationHours;
        
        // ============ Calculate Sharpe Ratio ============
        const returns = this._calculateReturns();
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const returnStdDev = this._calculateStandardDeviation(returns, avgReturn);
        const sharpeRatio = returnStdDev > 0 ? (avgReturn / returnStdDev) * Math.sqrt(252) : 0; // Annualized
        
        // ============ Store Results ============
        this.results.performance = {
            totalReturn,
            maxDrawdown,
            winRate,
            profitFactor,
            tradesPerHour,
            hourlyReturn,
            sharpeRatio,
            totalTrades: this.results.trades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            totalWins,
            totalLosses,
            finalCapital: this.portfolio.totalValue,
            initialCapital: this.config.INITIAL_CAPITAL
        };
        
        // ============ Calculate Strategy-Specific Metrics ============
        this.results.metrics = {
            avgTradeSize: this._calculateAverageTradeSize(),
            avgHoldTime: this._calculateAverageHoldTime(),
            maxConsecutiveLosses: this._calculateMaxConsecutiveLosses(),
            maxConsecutiveWins: this._calculateMaxConsecutiveWins(),
            largestWin: this._calculateLargestWin(),
            largestLoss: this._calculateLargestLoss(),
            profitabilityByPair: this._calculateProfitabilityByPair(),
            performanceByTimeOfDay: this._calculatePerformanceByTimeOfDay(),
            volatilityAdjustedReturn: totalReturn / (returnStdDev || 1)
        };
    }

    /**
     * @notice Generate comprehensive performance report
     * @returns {Object} Performance report
     */
    _generatePerformanceReport() {
        const benchmarkComparison = this._compareToBenchmark();
        
        return {
            // ============ Summary ============
            summary: {
                scenario: this.marketData.scenario || 'unknown',
                duration: this.config.SIMULATION_DURATION,
                totalTrades: this.results.trades.length,
                finalReturn: this.results.performance.totalReturn,
                benchmarkStatus: benchmarkComparison.status,
                overallGrade: this._calculateOverallGrade()
            },
            
            // ============ Performance Metrics ============
            performance: this.results.performance,
            
            // ============ Detailed Metrics ============
            metrics: this.results.metrics,
            
            // ============ Benchmark Comparison ============
            benchmark: benchmarkComparison,
            
            // ============ Timeline Data ============
            timeline: this.results.timeline,
            
            // ============ Trade Analysis ============
            trades: {
                all: this.results.trades,
                winning: this.results.trades.filter(t => this._isWinningTrade(t)),
                losing: this.results.trades.filter(t => this._isLosingTrade(t)),
                byPair: this._groupTradesByPair()
            },
            
            // ============ Risk Analysis ============
            risk: {
                maxDrawdown: this.results.performance.maxDrawdown,
                volatility: this._calculatePortfolioVolatility(),
                sharpeRatio: this.results.performance.sharpeRatio,
                var95: this._calculateValueAtRisk(0.95),
                var99: this._calculateValueAtRisk(0.99)
            },
            
            // ============ Errors and Issues ============
            errors: this.results.errors,
            
            // ============ Recommendations ============
            recommendations: this._generateRecommendations()
        };
    }

    // ============ Helper Methods ============

    _getTickIndexForInterval(interval) {
        const intervalMs = this._parseInterval(interval);
        return Math.floor(this.currentTime / intervalMs);
    }

    _parseInterval(interval) {
        const unit = interval.slice(-1);
        const value = parseInt(interval.slice(0, -1));
        
        switch (unit) {
            case 's': return value * 1000;
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            default: return 1000;
        }
    }

    _getDefaultOrderBook() {
        return {
            bidPrice: 50000,
            askPrice: 50050,
            bidVolume: 1000000,
            askVolume: 1000000,
            spread: 50,
            imbalance: 0,
            spreadTightness: 0.999,
            largeOrders: []
        };
    }

    _determineMarketRegime(currentPrices) {
        // Simple market regime detection based on price movement
        let totalChange = 0;
        let volatility = 0;
        let count = 0;

        for (const [pair, priceData] of Object.entries(currentPrices)) {
            if (priceData && priceData.change !== undefined) {
                totalChange += priceData.change;
                volatility += Math.abs(priceData.change);
                count++;
            }
        }

        if (count === 0) {
            return { type: 'RANGING', trend: 'NEUTRAL', volatility: 'MODERATE', confidence: 0.5, riskLevel: 'MEDIUM' };
        }

        const avgChange = totalChange / count;
        const avgVolatility = volatility / count;

        let type = 'RANGING';
        let trend = 'NEUTRAL';
        let riskLevel = 'MEDIUM';
        let confidence = 0.6;

        if (avgVolatility > 0.005) {
            type = 'HIGH_VOLATILITY';
            riskLevel = 'HIGH';
            confidence = 0.8;
        } else if (avgVolatility < 0.001) {
            type = 'LOW_VOLATILITY';
            riskLevel = 'LOW';
        }

        if (Math.abs(avgChange) > 0.002) {
            type = avgChange > 0 ? 'TRENDING_BULL' : 'TRENDING_BEAR';
            trend = avgChange > 0 ? 'BULLISH' : 'BEARISH';
            confidence = 0.75;
        }

        return {
            type,
            trend,
            volatility: avgVolatility > 0.005 ? 'HIGH' : avgVolatility < 0.001 ? 'LOW' : 'MODERATE',
            confidence,
            riskLevel
        };
    }

    _calculateSlippage(amount, volume) {
        // Calculate slippage based on trade size relative to volume
        const impactRatio = amount / (volume || 1000000);
        return Math.min(0.005, impactRatio * 0.1); // Max 0.5% slippage
    }

    _getCurrentMarketConditions() {
        return {
            timestamp: this.currentTime,
            tick: this.currentTick,
            regime: this.strategy.marketRegime?.current || 'UNKNOWN',
            volatility: 'MODERATE' // Simplified for backtesting
        };
    }

    _calculateTradePnL(trade, currentPosition) {
        // Simplified P&L calculation for backtesting
        if (trade.action === 'BUY') {
            return currentPosition ? (currentPosition.avgPrice - trade.price) * trade.netAmount : 0;
        } else {
            return (trade.price - (currentPosition?.avgPrice || trade.price)) * trade.netAmount;
        }
    }

    _calculateReturns() {
        const returns = [];
        for (let i = 1; i < this.results.timeline.length; i++) {
            const currentValue = this.results.timeline[i].portfolioValue;
            const previousValue = this.results.timeline[i - 1].portfolioValue;
            const return_pct = (currentValue - previousValue) / previousValue;
            returns.push(return_pct);
        }
        return returns;
    }

    _calculateStandardDeviation(values, mean) {
        if (values.length === 0) return 0;
        const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((sum, sqDiff) => sum + sqDiff, 0) / values.length;
        return Math.sqrt(avgSquaredDiff);
    }

    _calculateAverageTradeSize() {
        if (this.results.trades.length === 0) return 0;
        const totalSize = this.results.trades.reduce((sum, trade) => sum + trade.amount, 0);
        return totalSize / this.results.trades.length;
    }

    _calculateAverageHoldTime() {
        // Simplified hold time calculation
        return 300000; // 5 minutes average for scalping
    }

    _calculateMaxConsecutiveLosses() {
        let maxLosses = 0;
        let currentLosses = 0;
        
        for (const trade of this.results.trades) {
            if (this._isLosingTrade(trade)) {
                currentLosses++;
                maxLosses = Math.max(maxLosses, currentLosses);
            } else {
                currentLosses = 0;
            }
        }
        
        return maxLosses;
    }

    _calculateMaxConsecutiveWins() {
        let maxWins = 0;
        let currentWins = 0;
        
        for (const trade of this.results.trades) {
            if (this._isWinningTrade(trade)) {
                currentWins++;
                maxWins = Math.max(maxWins, currentWins);
            } else {
                currentWins = 0;
            }
        }
        
        return maxWins;
    }

    _calculateLargestWin() {
        const winningTrades = this.results.trades.filter(t => this._isWinningTrade(t));
        if (winningTrades.length === 0) return 0;
        
        return Math.max(...winningTrades.map(trade => {
            const position = this.portfolio.positions.get(trade.pair);
            return this._calculateTradePnL(trade, position);
        }));
    }

    _calculateLargestLoss() {
        const losingTrades = this.results.trades.filter(t => this._isLosingTrade(t));
        if (losingTrades.length === 0) return 0;
        
        return Math.min(...losingTrades.map(trade => {
            const position = this.portfolio.positions.get(trade.pair);
            return this._calculateTradePnL(trade, position);
        }));
    }

    _calculateProfitabilityByPair() {
        const profitability = {};
        
        for (const pair of this.config.TRADING_PAIRS) {
            const pairTrades = this.results.trades.filter(t => t.pair === pair);
            const totalPnL = pairTrades.reduce((sum, trade) => {
                const position = this.portfolio.positions.get(trade.pair);
                return sum + this._calculateTradePnL(trade, position);
            }, 0);
            
            profitability[pair] = {
                trades: pairTrades.length,
                totalPnL,
                avgPnL: pairTrades.length > 0 ? totalPnL / pairTrades.length : 0
            };
        }
        
        return profitability;
    }

    _calculatePerformanceByTimeOfDay() {
        const hourlyPerformance = {};
        
        for (const trade of this.results.trades) {
            const hour = new Date(trade.timestamp).getHours();
            if (!hourlyPerformance[hour]) {
                hourlyPerformance[hour] = { trades: 0, totalPnL: 0 };
            }
            
            hourlyPerformance[hour].trades++;
            const position = this.portfolio.positions.get(trade.pair);
            hourlyPerformance[hour].totalPnL += this._calculateTradePnL(trade, position);
        }
        
        return hourlyPerformance;
    }

    _calculatePortfolioVolatility() {
        const returns = this._calculateReturns();
        if (returns.length === 0) return 0;
        
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        return this._calculateStandardDeviation(returns, avgReturn);
    }

    _calculateValueAtRisk(confidence) {
        const returns = this._calculateReturns();
        if (returns.length === 0) return 0;
        
        const sortedReturns = returns.sort((a, b) => a - b);
        const index = Math.floor((1 - confidence) * sortedReturns.length);
        return sortedReturns[index] || 0;
    }

    _isWinningTrade(trade) {
        const position = this.portfolio.positions.get(trade.pair);
        return this._calculateTradePnL(trade, position) > 0;
    }

    _isLosingTrade(trade) {
        return !this._isWinningTrade(trade);
    }

    _groupTradesByPair() {
        const grouped = {};
        for (const trade of this.results.trades) {
            if (!grouped[trade.pair]) {
                grouped[trade.pair] = [];
            }
            grouped[trade.pair].push(trade);
        }
        return grouped;
    }

    _compareToBenchmark() {
        const performance = this.results.performance;
        const benchmark = this.config.BENCHMARK_METRICS;
        
        const comparison = {
            winRate: { 
                actual: performance.winRate, 
                target: benchmark.MIN_WIN_RATE, 
                passed: performance.winRate >= benchmark.MIN_WIN_RATE 
            },
            profitFactor: { 
                actual: performance.profitFactor, 
                target: benchmark.MIN_PROFIT_FACTOR, 
                passed: performance.profitFactor >= benchmark.MIN_PROFIT_FACTOR 
            },
            maxDrawdown: { 
                actual: performance.maxDrawdown, 
                target: benchmark.MAX_DRAWDOWN, 
                passed: performance.maxDrawdown <= benchmark.MAX_DRAWDOWN 
            },
            sharpeRatio: { 
                actual: performance.sharpeRatio, 
                target: benchmark.MIN_SHARPE_RATIO, 
                passed: performance.sharpeRatio >= benchmark.MIN_SHARPE_RATIO 
            },
            tradesPerHour: { 
                actual: performance.tradesPerHour, 
                target: benchmark.MIN_TRADES_PER_HOUR, 
                passed: performance.tradesPerHour >= benchmark.MIN_TRADES_PER_HOUR 
            },
            hourlyReturn: { 
                actual: performance.hourlyReturn, 
                target: benchmark.TARGET_HOURLY_RETURN, 
                passed: performance.hourlyReturn >= benchmark.TARGET_HOURLY_RETURN 
            }
        };
        
        const passedTests = Object.values(comparison).filter(test => test.passed).length;
        const totalTests = Object.keys(comparison).length;
        
        return {
            comparison,
            passedTests,
            totalTests,
            passRate: passedTests / totalTests,
            status: passedTests >= totalTests * 0.7 ? 'PASS' : 'FAIL' // 70% pass rate required
        };
    }

    _calculateOverallGrade() {
        const benchmark = this._compareToBenchmark();
        const passRate = benchmark.passRate;
        
        if (passRate >= 0.9) return 'A';
        if (passRate >= 0.8) return 'B';
        if (passRate >= 0.7) return 'C';
        if (passRate >= 0.6) return 'D';
        return 'F';
    }

    _generateRecommendations() {
        const recommendations = [];
        const performance = this.results.performance;
        const benchmark = this.config.BENCHMARK_METRICS;
        
        // ============ Win Rate Recommendations ============
        if (performance.winRate < benchmark.MIN_WIN_RATE) {
            recommendations.push({
                category: 'Entry Strategy',
                priority: 'HIGH',
                issue: `Win rate (${(performance.winRate * 100).toFixed(1)}%) below target (${(benchmark.MIN_WIN_RATE * 100).toFixed(1)}%)`,
                recommendation: 'Increase signal selectivity and improve entry criteria. Consider adding more confirmation indicators.'
            });
        }
        
        // ============ Profit Factor Recommendations ============
        if (performance.profitFactor < benchmark.MIN_PROFIT_FACTOR) {
            recommendations.push({
                category: 'Risk Management',
                priority: 'HIGH',
                issue: `Profit factor (${performance.profitFactor.toFixed(2)}) below target (${benchmark.MIN_PROFIT_FACTOR})`,
                recommendation: 'Improve win/loss ratio by tightening stop losses or widening take profits. Review position sizing.'
            });
        }
        
        // ============ Drawdown Recommendations ============
        if (performance.maxDrawdown > benchmark.MAX_DRAWDOWN) {
            recommendations.push({
                category: 'Risk Management',
                priority: 'CRITICAL',
                issue: `Maximum drawdown (${performance.maxDrawdown.toFixed(2)}%) exceeds limit (${benchmark.MAX_DRAWDOWN}%)`,
                recommendation: 'Implement stricter risk controls. Reduce position sizes and add circuit breakers for high volatility periods.'
            });
        }
        
        // ============ Trading Frequency Recommendations ============
        if (performance.tradesPerHour < benchmark.MIN_TRADES_PER_HOUR) {
            recommendations.push({
                category: 'Strategy Optimization',
                priority: 'MEDIUM',
                issue: `Trading frequency (${performance.tradesPerHour.toFixed(1)} trades/hour) below target (${benchmark.MIN_TRADES_PER_HOUR})`,
                recommendation: 'Reduce entry thresholds or add more trading pairs. Consider shorter timeframes for signal generation.'
            });
        }
        
        // ============ Return Recommendations ============
        if (performance.hourlyReturn < benchmark.TARGET_HOURLY_RETURN) {
            recommendations.push({
                category: 'Performance',
                priority: 'MEDIUM',
                issue: `Hourly return (${performance.hourlyReturn.toFixed(2)}%) below target (${benchmark.TARGET_HOURLY_RETURN}%)`,
                recommendation: 'Optimize position sizing and improve signal quality. Consider adding momentum-based strategies.'
            });
        }
        
        // ============ Positive Feedback ============
        if (recommendations.length === 0) {
            recommendations.push({
                category: 'Performance',
                priority: 'INFO',
                issue: 'Strategy meets all benchmark criteria',
                recommendation: 'Strategy is performing well. Consider minor optimizations to improve consistency.'
            });
        }
        
        return recommendations;
    }

    _logProgress() {
        const progressPercent = (this.currentTick / Math.floor(this.config.SIMULATION_DURATION / this.config.TICK_INTERVAL)) * 100;
        const currentReturn = ((this.portfolio.totalValue / this.config.INITIAL_CAPITAL) - 1) * 100;
        
        this.logger.info('Backtesting progress', {
            progress: `${progressPercent.toFixed(1)}%`,
            trades: this.results.trades.length,
            return: `${currentReturn.toFixed(2)}%`,
            portfolioValue: this.portfolio.totalValue.toFixed(2)
        });
    }
}

// ============ Main Backtesting Test Suite ============
describe('Strategy Backtesting Tests', () => {
    let marketDataGenerator;
    let tradingStrategy;
    let backtester;
    let logger;

    beforeAll(() => {
        logger = new Logger('BacktestingSuite');
        jest.setTimeout(60000); // 60 seconds for backtesting
    });

    beforeEach(() => {
        // ============ Initialize Mock Strategy ============
        tradingStrategy = new TradingStrategy(
            createMockRecallClient(),
            createMockVincentClient(),
            createMockGaiaClient(),
            logger
        );
    });

    // ============ Market Scenario Tests ============
    describe('Market Scenario Backtests', () => {
        test('should perform well in trending bull market', async () => {
            // ============ Generate Bull Market Data ============
            marketDataGenerator = new MarketDataGenerator(
                BACKTEST_CONFIG.MARKET_SCENARIOS.TRENDING_BULL,
                BACKTEST_CONFIG.SIMULATION_DURATION,
                BACKTEST_CONFIG.TICK_INTERVAL
            );
            
            const marketData = marketDataGenerator.generateHistoricalData();
            marketData.scenario = BACKTEST_CONFIG.MARKET_SCENARIOS.TRENDING_BULL;
            
            // ============ Run Backtest ============
            backtester = new StrategyBacktester(tradingStrategy, marketData);
            const results = await backtester.runBacktest();
            
            // ============ Verify Results ============
            expect(results.summary.finalReturn).toBeGreaterThan(0); // Should be profitable in bull market
            expect(results.performance.totalTrades).toBeGreaterThan(10); // Should execute multiple trades
            expect(results.benchmark.status).toBeDefined();
            
            // ============ Log Results ============
            logger.info('Bull market backtest completed', {
                return: results.summary.finalReturn,
                trades: results.performance.totalTrades,
                winRate: results.performance.winRate,
                grade: results.summary.overallGrade
            });
        });

        test('should manage risk in high volatility market', async () => {
            // ============ Generate High Volatility Data ============
            marketDataGenerator = new MarketDataGenerator(
                BACKTEST_CONFIG.MARKET_SCENARIOS.HIGH_VOLATILITY,
                BACKTEST_CONFIG.SIMULATION_DURATION,
                BACKTEST_CONFIG.TICK_INTERVAL
            );
            
            const marketData = marketDataGenerator.generateHistoricalData();
            marketData.scenario = BACKTEST_CONFIG.MARKET_SCENARIOS.HIGH_VOLATILITY;
            
            // ============ Run Backtest ============
            backtester = new StrategyBacktester(tradingStrategy, marketData);
            const results = await backtester.runBacktest();
            
            // ============ Verify Risk Management ============
            expect(results.performance.maxDrawdown).toBeLessThan(10); // Should limit drawdown
            expect(results.risk.sharpeRatio).toBeGreaterThan(0); // Should have positive risk-adjusted returns
            expect(results.performance.totalTrades).toBeGreaterThan(15); // Should be active in volatility
            
            logger.info('High volatility backtest completed', {
                return: results.summary.finalReturn,
                maxDrawdown: results.performance.maxDrawdown,
                sharpeRatio: results.risk.sharpeRatio,
                grade: results.summary.overallGrade
            });
        });

        test('should handle sideways choppy market', async () => {
            // ============ Generate Choppy Market Data ============
            marketDataGenerator = new MarketDataGenerator(
                BACKTEST_CONFIG.MARKET_SCENARIOS.SIDEWAYS_CHOPPY,
                BACKTEST_CONFIG.SIMULATION_DURATION,
                BACKTEST_CONFIG.TICK_INTERVAL
            );
            
            const marketData = marketDataGenerator.generateHistoricalData();
            marketData.scenario = BACKTEST_CONFIG.MARKET_SCENARIOS.SIDEWAYS_CHOPPY;
            
            // ============ Run Backtest ============
            backtester = new StrategyBacktester(tradingStrategy, marketData);
            const results = await backtester.runBacktest();
            
            // ============ Verify Choppy Market Performance ============
            expect(results.performance.winRate).toBeGreaterThan(0.5); // Should maintain edge
            expect(results.performance.totalTrades).toBeGreaterThan(20); // Should be active in chop
            expect(Math.abs(results.summary.finalReturn)).toBeLessThan(15); // Limited moves in choppy market
            
            logger.info('Choppy market backtest completed', {
                return: results.summary.finalReturn,
                winRate: results.performance.winRate,
                trades: results.performance.totalTrades,
                grade: results.summary.overallGrade
            });
        });
    });

    // ============ Performance Benchmark Tests ============
    describe('Performance Benchmark Tests', () => {
        test('should meet minimum win rate requirements', async () => {
            marketDataGenerator = new MarketDataGenerator(
                BACKTEST_CONFIG.MARKET_SCENARIOS.TRENDING_BULL,
                BACKTEST_CONFIG.SIMULATION_DURATION,
                BACKTEST_CONFIG.TICK_INTERVAL
            );
            
            const marketData = marketDataGenerator.generateHistoricalData();
            backtester = new StrategyBacktester(tradingStrategy, marketData);
            const results = await backtester.runBacktest();
            
            expect(results.performance.winRate).toBeGreaterThanOrEqual(BACKTEST_CONFIG.BENCHMARK_METRICS.MIN_WIN_RATE);
            expect(results.benchmark.comparison.winRate.passed).toBe(true);
        });

        test('should achieve minimum profit factor', async () => {
            marketDataGenerator = new MarketDataGenerator(
                BACKTEST_CONFIG.MARKET_SCENARIOS.TRENDING_BULL,
                BACKTEST_CONFIG.SIMULATION_DURATION,
                BACKTEST_CONFIG.TICK_INTERVAL
            );
            
            const marketData = marketDataGenerator.generateHistoricalData();
            backtester = new StrategyBacktester(tradingStrategy, marketData);
            const results = await backtester.runBacktest();
            
            expect(results.performance.profitFactor).toBeGreaterThanOrEqual(BACKTEST_CONFIG.BENCHMARK_METRICS.MIN_PROFIT_FACTOR);
        });

        test('should maintain acceptable drawdown levels', async () => {
            marketDataGenerator = new MarketDataGenerator(
                BACKTEST_CONFIG.MARKET_SCENARIOS.HIGH_VOLATILITY,
                BACKTEST_CONFIG.SIMULATION_DURATION,
                BACKTEST_CONFIG.TICK_INTERVAL
            );
            
            const marketData = marketDataGenerator.generateHistoricalData();
            backtester = new StrategyBacktester(tradingStrategy, marketData);
            const results = await backtester.runBacktest();
            
            expect(results.performance.maxDrawdown).toBeLessThanOrEqual(BACKTEST_CONFIG.BENCHMARK_METRICS.MAX_DRAWDOWN);
        });
    });

    // ============ Edge Case Tests ============
    describe('Edge Case Scenario Tests', () => {
        test('should handle flash crash scenario', async () => {
            marketDataGenerator = new MarketDataGenerator(
                BACKTEST_CONFIG.MARKET_SCENARIOS.FLASH_CRASH,
                BACKTEST_CONFIG.SIMULATION_DURATION,
                BACKTEST_CONFIG.TICK_INTERVAL
            );
            
            const marketData = marketDataGenerator.generateHistoricalData();
            backtester = new StrategyBacktester(tradingStrategy, marketData);
            const results = await backtester.runBacktest();
            
            // ============ Should Survive Flash Crash ============
            expect(results.portfolio.totalValue).toBeGreaterThan(BACKTEST_CONFIG.INITIAL_CAPITAL * 0.7); // Max 30% loss
            expect(results.performance.maxDrawdown).toBeLessThan(20); // Reasonable drawdown control
            
            logger.info('Flash crash backtest completed', {
                finalValue: results.portfolio.totalValue,
                maxDrawdown: results.performance.maxDrawdown,
                survived: results.portfolio.totalValue > BACKTEST_CONFIG.INITIAL_CAPITAL * 0.5
            });
        });
    });
});

// ============ Mock Helper Functions ============
function createMockRecallClient() {
    return {
        getOrCreateBucket: jest.fn().mockResolvedValue({ bucket: 'backtest-bucket' }),
        addObject: jest.fn().mockResolvedValue({ success: true }),
        queryObjects: jest.fn().mockResolvedValue({ objects: [] })
    };
}

function createMockVincentClient() {
    return {
        precheck: jest.fn().mockResolvedValue({ success: true }),
        execute: jest.fn().mockResolvedValue({ success: true, result: { transactionHash: '0xbacktest' } })
    };
}

function createMockGaiaClient() {
    return {
        chat: jest.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify({ analysis: 'backtest', confidence: 0.7 }) } }]
        })
    };
}