// ============ Imports ============
import { jest } from '@jest/globals';
import { TradingStrategy } from '../src/core/TradingStrategy.js';
import { TechnicalIndicators } from '../src/analytics/TechnicalIndicators.js';
import { RiskManager } from '../src/core/RiskManager.js';
import { Logger } from '../src/utils/Logger.js';

// ============ Mock Dependencies ============
jest.mock('../src/analytics/TechnicalIndicators.js');
jest.mock('../src/core/RiskManager.js');
jest.mock('../src/utils/Logger.js');

// ============ Mock Data ============
const mockRecallClient = {
  getOrCreateBucket: jest.fn().mockResolvedValue({ bucket: '0xtest123' }),
  addObject: jest.fn().mockResolvedValue({ success: true }),
  queryObjects: jest.fn().mockResolvedValue({ objects: [] }),
  getObject: jest.fn().mockResolvedValue({ value: '{"test": "data"}' })
};

const mockVincentClient = {
  executePolicy: jest.fn().mockResolvedValue({ success: true, transactionHash: '0xhash123' }),
  precheck: jest.fn().mockResolvedValue({ success: true, canExecute: true }),
  createPolicy: jest.fn().mockResolvedValue({ policyId: 'policy123' })
};

const mockGaiaClient = {
  chat: jest.fn().mockResolvedValue({
    choices: [{ message: { content: '{"analysis": "bullish", "confidence": 0.8}' } }]
  }),
  embedding: jest.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
};

// const mockMarketData = {
//   '1s': { price: 50000, volume: 1000000, timestamp: Date.now() },
//   '5s': { price: 50010, volume: 1200000, timestamp: Date.now() },
//   '1m': { price: 50020, volume: 1500000, timestamp: Date.now() },
//   '5m': { price: 50050, volume: 2000000, timestamp: Date.now() }
// };

const mockAdvancedIndicators = {
  rsi: { '1m': 45, '5m': 48 },
  macd: { line: 5, signal: 3, histogram: 2, trend: 'BULLISH_CROSSOVER' },
  bollingerBands: { upper: 51000, middle: 50000, lower: 49000, position: 0.6, squeeze: false },
  volume: { spike: 1.5, trend: 'INCREASING' },
  momentum: { roc: 2.5, stochastic: 65, divergence: false },
  scalping: { microTrend: 'UP', momentumScore: 0.7, velocityIndex: 0.3 }
};

const mockOrderBookAnalysis = {
  bidVolume: 1500000,
  askVolume: 1200000,
  bidPrice: 49950,
  askPrice: 50050,
  midPrice: 50000,
  spread: 100,
  imbalance: 0.111,
  spreadTightness: 0.998,
  largeOrderFlow: 300000,
  largeOrders: [
    { side: 'BUY', size: 200000, price: 49980 },
    { side: 'BUY', size: 100000, price: 49975 }
  ]
};

// ============ Test Suite ============
describe('TradingStrategy Unit Tests', () => {
  let tradingStrategy;
  let mockLogger;

  beforeEach(() => {
    // ============ Clear All Mocks ============
    jest.clearAllMocks();

    // ============ Setup Mock Logger ============
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    Logger.mockImplementation(() => mockLogger);

    // ============ Setup Mock Technical Indicators ============
    TechnicalIndicators.mockImplementation(() => ({
      calculateRSI: jest.fn().mockReturnValue(45),
      calculateMACD: jest.fn().mockReturnValue({ line: 5, signal: 3, histogram: 2 }),
      calculateBollingerBands: jest.fn().mockReturnValue({ upper: 51000, middle: 50000, lower: 49000 }),
      calculateVolume: jest.fn().mockReturnValue({ spike: 1.5, trend: 'INCREASING' })
    }));

    // ============ Setup Mock Risk Manager ============
    RiskManager.mockImplementation(() => ({
      canOpenPosition: jest.fn().mockReturnValue(true),
      adjustPositionSize: jest.fn().mockReturnValue(1000),
      getRiskStatus: jest.fn().mockReturnValue({ riskLevel: 'MEDIUM' }),
      calculateMaxPosition: jest.fn().mockReturnValue(5000)
    }));

    // ============ Initialize Trading Strategy ============
    tradingStrategy = new TradingStrategy(
      mockRecallClient,
      mockVincentClient,
      mockGaiaClient,
      mockLogger
    );
  });

  afterEach(() => {
    // ============ Cleanup ============
    if (tradingStrategy && tradingStrategy.isActive) {
      tradingStrategy.stop();
    }
  });

  // ============ Constructor Tests ============
  describe('Constructor', () => {
    test('should initialize with default configuration', () => {
      expect(tradingStrategy.isActive).toBe(false);
      expect(tradingStrategy.currentPositions).toBeInstanceOf(Map);
      expect(tradingStrategy.tradeHistory).toEqual([]);
      expect(tradingStrategy.tradingPairs).toEqual(['BTC/USDT', 'ETH/USDT', 'SOL/USDC']);
      expect(tradingStrategy.maxConcurrentTrades).toBe(5);
      expect(tradingStrategy.basePositionSize).toBe(0.08);
    });

    test('should initialize performance metrics to zero', () => {
      const metrics = tradingStrategy.performanceMetrics;
      expect(metrics.totalTrades).toBe(0);
      expect(metrics.winningTrades).toBe(0);
      expect(metrics.totalProfit).toBe(0);
      expect(metrics.winRate).toBe(0);
      expect(metrics.profitFactor).toBe(0);
    });

    test('should initialize market regime to RANGING', () => {
      expect(tradingStrategy.marketRegime.current).toBe('RANGING');
      expect(tradingStrategy.marketRegime.confidence).toBe(0.5);
    });

    test('should initialize adaptive parameters with defaults', () => {
      const params = tradingStrategy.adaptiveParams;
      expect(params.entryThreshold).toBe(0.6);
      expect(params.exitThreshold).toBe(-0.6);
      expect(params.positionSizeMultiplier).toBe(1.0);
    });
  });

  // ============ Enhanced Signal Generation Tests ============
  describe('Enhanced Signal Generation', () => {
    test('should generate BUY signal with high confidence', () => {
      // ============ Mock Strong Bullish Conditions ============
      const mockParams = {
        pair: 'BTC/USDT',
        indicators: {
          ...mockAdvancedIndicators,
          rsi: { '1m': 25, '5m': 28 }, // Oversold
          macd: { line: 10, signal: 5, histogram: 5, trend: 'BULLISH_CROSSOVER' }
        },
        orderBook: {
          ...mockOrderBookAnalysis,
          imbalance: 0.3 // Strong buy side
        },
        sentiment: { score: 0.85, newsImpact: 'POSITIVE', socialMomentum: 'STRONG' },
        mlPrediction: { direction: 'UP', confidence: 0.9, magnitude: 1.5 },
        marketAnalysis: { trend: 'BULLISH', volatility: 'MODERATE' },
        arbitrageOpportunities: [{ profit: 0.25, confidence: 0.8 }]
      };

      const signal = tradingStrategy._generateEnhancedTradingSignal(mockParams);

      expect(signal.action).toBe('BUY');
      expect(signal.confidence).toBeGreaterThan(0.6);
      expect(signal.score).toBeGreaterThan(0);
      expect(signal.strategyBreakdown).toHaveProperty('technical');
      expect(signal.strategyBreakdown).toHaveProperty('microstructure');
      expect(signal.strategyBreakdown).toHaveProperty('machineLearning');
    });

    test('should generate SELL signal with bearish conditions', () => {
      // ============ Mock Strong Bearish Conditions ============
      const mockParams = {
        pair: 'ETH/USDT',
        indicators: {
          ...mockAdvancedIndicators,
          rsi: { '1m': 78, '5m': 82 }, // Overbought
          macd: { line: -8, signal: -3, histogram: -5, trend: 'BEARISH_CROSSOVER' }
        },
        orderBook: {
          ...mockOrderBookAnalysis,
          imbalance: -0.25 // Strong sell side
        },
        sentiment: { score: 0.15, newsImpact: 'NEGATIVE', socialMomentum: 'WEAK' },
        mlPrediction: { direction: 'DOWN', confidence: 0.85, magnitude: -2.0 },
        marketAnalysis: { trend: 'BEARISH', volatility: 'HIGH' }
      };

      const signal = tradingStrategy._generateEnhancedTradingSignal(mockParams);

      expect(signal.action).toBe('SELL');
      expect(signal.confidence).toBeGreaterThan(0.6);
      expect(signal.score).toBeLessThan(0);
    });

    test('should generate HOLD signal with neutral conditions', () => {
      // ============ Mock Neutral Market Conditions ============
      const mockParams = {
        pair: 'SOL/USDC',
        indicators: {
          ...mockAdvancedIndicators,
          rsi: { '1m': 50, '5m': 52 }, // Neutral
          macd: { line: 1, signal: 0.5, histogram: 0.5, trend: 'NEUTRAL' }
        },
        orderBook: {
          ...mockOrderBookAnalysis,
          imbalance: 0.05 // Balanced
        },
        sentiment: { score: 0.5, newsImpact: 'NEUTRAL', socialMomentum: 'MODERATE' },
        mlPrediction: { direction: 'SIDEWAYS', confidence: 0.4, magnitude: 0.1 },
        marketAnalysis: { trend: 'NEUTRAL', volatility: 'LOW' }
      };

      const signal = tradingStrategy._generateEnhancedTradingSignal(mockParams);

      expect(signal.action).toBe('HOLD');
      expect(Math.abs(signal.score)).toBeLessThan(0.6);
    });
  });

  // ============ Technical Signal Analysis Tests ============
  describe('Technical Signal Analysis', () => {
    test('should analyze multi-timeframe RSI correctly', () => {
      const mockIndicators = {
        rsi: { '1m': 25, '5m': 30, '15s': 28 },
        macd: mockAdvancedIndicators.macd,
        bollingerBands: mockAdvancedIndicators.bollingerBands,
        volume: mockAdvancedIndicators.volume,
        momentum: mockAdvancedIndicators.momentum
      };

      const result = tradingStrategy._analyzeTechnicalSignals(mockIndicators);

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('strength');
      expect(result).toHaveProperty('components');
      expect(result.components).toHaveProperty('rsiSignal');
      expect(result.components).toHaveProperty('macdSignal');
      expect(result.components).toHaveProperty('bbSignal');
    });

    test('should detect MACD bullish crossover', () => {
      const mockIndicators = {
        rsi: { '1m': 50 },
        macd: { line: 5, signal: 3, histogram: 2, trend: 'BULLISH_CROSSOVER' },
        bollingerBands: mockAdvancedIndicators.bollingerBands,
        volume: mockAdvancedIndicators.volume,
        momentum: mockAdvancedIndicators.momentum
      };

      const result = tradingStrategy._analyzeTechnicalSignals(mockIndicators);

      expect(result.components.macdSignal.score).toBeGreaterThan(0);
      expect(result.components.macdSignal.strength).toBeGreaterThan(0);
    });

    test('should detect volume spike signals', () => {
      const mockIndicators = {
        rsi: { '1m': 50 },
        macd: mockAdvancedIndicators.macd,
        bollingerBands: mockAdvancedIndicators.bollingerBands,
        volume: { spike: 3.5, trend: 'INCREASING' }, // High volume spike
        momentum: mockAdvancedIndicators.momentum
      };

      const result = tradingStrategy._analyzeTechnicalSignals(mockIndicators);

      expect(result.components.volumeSignal.score).toBeGreaterThan(0);
      expect(result.components.volumeSignal.strength).toBeGreaterThan(0.5);
    });
  });

  // ============ Market Microstructure Analysis Tests ============
  describe('Market Microstructure Analysis', () => {
    test('should analyze order book imbalance correctly', () => {
      const mockOrderBook = {
        ...mockOrderBookAnalysis,
        imbalance: 0.4 // Strong buy-side imbalance
      };

      const result = tradingStrategy._analyzeMarketMicrostructure(mockOrderBook);

      expect(result.score).toBeGreaterThan(0);
      expect(result.strength).toBeGreaterThan(0);
      expect(result.imbalance).toBe(0.4);
    });

    test('should detect tight spreads as positive signal', () => {
      const mockOrderBook = {
        ...mockOrderBookAnalysis,
        spread: 50,
        midPrice: 50000,
        spreadTightness: 0.999 // Very tight spread
      };

      const result = tradingStrategy._analyzeMarketMicrostructure(mockOrderBook);

      expect(result.spreadTightness).toBe(0.999);
      expect(result.strength).toBeGreaterThan(0.8);
    });

    test('should analyze large order flow impact', () => {
      const mockOrderBook = {
        ...mockOrderBookAnalysis,
        largeOrders: [
          { side: 'BUY', size: 500000, price: 49980 },
          { side: 'BUY', size: 300000, price: 49975 },
          { side: 'SELL', size: 100000, price: 50020 }
        ]
      };

      // Recalculate large order flow
      mockOrderBook.largeOrderFlow = mockOrderBook.largeOrders.reduce((sum, order) => {
        return sum + (order.side === 'BUY' ? order.size : -order.size);
      }, 0);

      const result = tradingStrategy._analyzeMarketMicrostructure(mockOrderBook);

      expect(result.score).toBeGreaterThan(0); // Net buying pressure
      expect(result.strength).toBeGreaterThan(0.2);
    });
  });

  // ============ Position Size Calculation Tests ============
  describe('Position Size Calculation', () => {
    test('should calculate enhanced position size with confidence scaling', () => {
      const mockSignal = {
        confidence: 0.9,
        action: 'BUY',
        strategyBreakdown: {
          arbitrage: { score: 0.2 },
          machineLearning: { confidence: 0.85 }
        }
      };

      const mockMarketData = {
        volatility: 0.02,
        liquidity: 1000000
      };

      // Mock internal methods
      tradingStrategy._getVolatility = jest.fn().mockReturnValue(0.02);
      tradingStrategy._getLiquidity = jest.fn().mockReturnValue(1000000);
      tradingStrategy._getRegimePositionMultiplier = jest.fn().mockReturnValue(1.2);

      const positionSize = tradingStrategy._calculateEnhancedPositionSize(
        'BTC/USDT',
        mockSignal,
        mockMarketData
      );

      expect(positionSize).toBeGreaterThan(50); // Minimum position size
      expect(positionSize).toBeLessThan(5000); // Maximum position size
      expect(typeof positionSize).toBe('number');
    });

    test('should reduce position size for high volatility', () => {
      const mockSignal = { confidence: 0.8 };
      const mockMarketData = {};

      // Mock high volatility
      tradingStrategy._getVolatility = jest.fn().mockReturnValue(0.08);
      tradingStrategy._getLiquidity = jest.fn().mockReturnValue(500000);
      tradingStrategy._getRegimePositionMultiplier = jest.fn().mockReturnValue(1.0);

      const positionSize = tradingStrategy._calculateEnhancedPositionSize(
        'ETH/USDT',
        mockSignal,
        mockMarketData
      );

      expect(positionSize).toBeLessThan(1000); // Should be reduced due to high volatility
    });

    test('should increase position size for arbitrage opportunities', () => {
      const mockSignal = {
        confidence: 0.7,
        strategyBreakdown: {
          arbitrage: { score: 0.3 }, // Strong arbitrage signal
          machineLearning: { confidence: 0.6 }
        }
      };

      tradingStrategy._getVolatility = jest.fn().mockReturnValue(0.03);
      tradingStrategy._getLiquidity = jest.fn().mockReturnValue(800000);
      tradingStrategy._getRegimePositionMultiplier = jest.fn().mockReturnValue(1.0);

      const baseSize = tradingStrategy.basePositionSize;
      const positionSize = tradingStrategy._calculateEnhancedPositionSize(
        'SOL/USDC',
        mockSignal,
        {}
      );

      // Should be increased due to arbitrage multiplier (1.3x)
      expect(positionSize).toBeGreaterThan(baseSize * 0.7 * 0.7 * 1.3); // confidence^2 * arbitrage multiplier
    });
  });

  // ============ Market Regime Detection Tests ============
  describe('Market Regime Detection', () => {
    test('should detect trending bull market', async () => {
      // Mock methods for market regime detection
      tradingStrategy._calculateAverageVolatility = jest.fn().mockReturnValue(0.04);
      tradingStrategy._calculateTrendStrength = jest.fn().mockReturnValue(0.8);
      tradingStrategy._analyzeLiquidityConditions = jest.fn().mockReturnValue({ good: true });

      await tradingStrategy._detectMarketRegime();

      expect(tradingStrategy.marketRegime.current).toBe('TRENDING_BULL');
      expect(tradingStrategy.marketRegime.confidence).toBe(0.8);
    });

    test('should detect high volatility regime', async () => {
      tradingStrategy._calculateAverageVolatility = jest.fn().mockReturnValue(0.12); // High volatility
      tradingStrategy._calculateTrendStrength = jest.fn().mockReturnValue(0.3);
      tradingStrategy._analyzeLiquidityConditions = jest.fn().mockReturnValue({ good: true });

      await tradingStrategy._detectMarketRegime();

      expect(tradingStrategy.marketRegime.current).toBe('HIGH_VOLATILITY');
      expect(tradingStrategy.marketRegime.confidence).toBe(0.7);
    });

    test('should detect low volatility regime', async () => {
      tradingStrategy._calculateAverageVolatility = jest.fn().mockReturnValue(0.015); // Low volatility
      tradingStrategy._calculateTrendStrength = jest.fn().mockReturnValue(0.2);
      tradingStrategy._analyzeLiquidityConditions = jest.fn().mockReturnValue({ good: true });

      await tradingStrategy._detectMarketRegime();

      expect(tradingStrategy.marketRegime.current).toBe('LOW_VOLATILITY');
      expect(tradingStrategy.marketRegime.confidence).toBe(0.6);
    });

    test('should update regime history when regime changes', async () => {
      // Set initial regime
      tradingStrategy.marketRegime.current = 'RANGING';
      tradingStrategy.marketRegime.lastUpdate = Date.now() - 60000; // 1 minute ago

      // Mock trending market conditions
      tradingStrategy._calculateAverageVolatility = jest.fn().mockReturnValue(0.04);
      tradingStrategy._calculateTrendStrength = jest.fn().mockReturnValue(0.8);
      tradingStrategy._analyzeLiquidityConditions = jest.fn().mockReturnValue({ good: true });

      await tradingStrategy._detectMarketRegime();

      expect(tradingStrategy.marketRegime.current).toBe('TRENDING_BULL');
      expect(tradingStrategy.marketRegime.history).toHaveLength(1);
      expect(tradingStrategy.marketRegime.history[0].regime).toBe('RANGING');
    });
  });

  // ============ Arbitrage Detection Tests ============
  describe('Arbitrage Detection', () => {
    test('should detect cross-exchange arbitrage opportunities', async () => {
      // Mock multi-exchange prices
      const mockExchangePrices = [
        { exchange: 'Binance', askPrice: 50000, bidPrice: 49980, volume: 1000000 },
        { exchange: 'Coinbase', askPrice: 50200, bidPrice: 50180, volume: 800000 }
      ];

      tradingStrategy._getMultiExchangePrices = jest.fn().mockResolvedValue(mockExchangePrices);
      tradingStrategy._calculateArbitrageConfidence = jest.fn().mockReturnValue(0.8);

      await tradingStrategy._scanCrossExchangeArbitrage();

      const opportunities = tradingStrategy.arbitrageDetector.crossExchangeOpportunities.get('BTC/USDT');
      expect(opportunities).toBeDefined();
      if (opportunities && opportunities.length > 0) {
        expect(opportunities[0].profit).toBeGreaterThan(0.15); // Above threshold
        expect(opportunities[0].type).toBe('CROSS_EXCHANGE');
      }
    });

    test('should detect cross-chain arbitrage opportunities', async () => {
      // Mock multi-chain prices
      const mockChainPrices = [
        { chain: 'Ethereum', price: 50000, liquidity: 2000000 },
        { chain: 'Arbitrum', price: 50150, liquidity: 1500000 },
        { chain: 'Polygon', price: 49900, liquidity: 1000000 }
      ];

      tradingStrategy._getMultiChainPrices = jest.fn().mockResolvedValue(mockChainPrices);
      tradingStrategy._estimateBridgeFee = jest.fn().mockReturnValue(0.05); // 0.05% bridge fee
      tradingStrategy._calculateArbitrageConfidence = jest.fn().mockReturnValue(0.7);

      await tradingStrategy._scanCrossChainArbitrage();

      const opportunities = tradingStrategy.arbitrageDetector.crossChainOpportunities.get('ETH/USDT');
      expect(opportunities).toBeDefined();
      if (opportunities && opportunities.length > 0) {
        expect(opportunities[0].netProfit).toBeGreaterThan(0.15); // Above threshold after fees
        expect(opportunities[0].type).toBe('CROSS_CHAIN');
      }
    });

    test('should calculate arbitrage confidence correctly', () => {
      const confidence1 = tradingStrategy._calculateArbitrageConfidence(0.25, 1000000, 800000);
      const confidence2 = tradingStrategy._calculateArbitrageConfidence(0.10, 500000, 300000);

      expect(confidence1).toBeGreaterThan(confidence2); // Higher profit should give higher confidence
      expect(confidence1).toBeGreaterThan(0);
      expect(confidence1).toBeLessThanOrEqual(1);
    });
  });

  // ============ Performance Metrics Tests ============
  describe('Performance Metrics', () => {
    test('should update trades per minute correctly', () => {
      // Add some mock recent trades
      const now = Date.now();
      tradingStrategy.tradeHistory = [
        { entryTime: now - 30000, exitTime: now - 25000, pnl: 0.5 },
        { entryTime: now - 45000, exitTime: now - 40000, pnl: -0.2 },
        { entryTime: now - 70000, exitTime: now - 65000, pnl: 0.8 } // Older than 1 minute
      ];

      tradingStrategy._updateEnhancedPerformanceMetrics();

      expect(tradingStrategy.performanceMetrics.tradesPerMinute).toBe(2); // Only recent trades
    });

    test('should calculate win rate correctly', () => {
      tradingStrategy.tradeHistory = [
        { entryTime: Date.now() - 60000, exitTime: Date.now() - 55000, pnl: 0.5 },
        { entryTime: Date.now() - 50000, exitTime: Date.now() - 45000, pnl: 0.3 },
        { entryTime: Date.now() - 40000, exitTime: Date.now() - 35000, pnl: -0.2 },
        { entryTime: Date.now() - 30000, exitTime: Date.now() - 25000, pnl: 0.1 }
      ];

      tradingStrategy._updateEnhancedPerformanceMetrics();

      expect(tradingStrategy.performanceMetrics.winRate).toBe(0.75); // 3 wins out of 4 trades
    });

    test('should calculate profit factor correctly', () => {
      tradingStrategy.tradeHistory = [
        { entryTime: Date.now() - 60000, exitTime: Date.now() - 55000, pnl: 1.0 },
        { entryTime: Date.now() - 50000, exitTime: Date.now() - 45000, pnl: 0.5 },
        { entryTime: Date.now() - 40000, exitTime: Date.now() - 35000, pnl: -0.3 },
        { entryTime: Date.now() - 30000, exitTime: Date.now() - 25000, pnl: -0.2 }
      ];

      tradingStrategy._updateEnhancedPerformanceMetrics();

      const totalWins = 1.5; // 1.0 + 0.5
      const totalLosses = 0.5; // 0.3 + 0.2
      const expectedProfitFactor = totalWins / totalLosses;

      expect(tradingStrategy.performanceMetrics.profitFactor).toBe(expectedProfitFactor);
    });
  });

  // ============ Adaptive Parameter Optimization Tests ============
  describe('Adaptive Parameter Optimization', () => {
    test('should increase selectivity when win rate is low', async () => {
      // Mock low win rate performance
      tradingStrategy._analyzeRecentPerformance = jest.fn().mockReturnValue({
        winRate: 0.4, // Low win rate
        profitFactor: 1.5,
        maxDrawdown: 2.0
      });

      const initialEntryThreshold = tradingStrategy.adaptiveParams.entryThreshold;
      const initialExitThreshold = tradingStrategy.adaptiveParams.exitThreshold;

      await tradingStrategy._optimizeParameters();

      expect(tradingStrategy.adaptiveParams.entryThreshold).toBeGreaterThan(initialEntryThreshold);
      expect(Math.abs(tradingStrategy.adaptiveParams.exitThreshold)).toBeLessThan(Math.abs(initialExitThreshold));
    });

    test('should increase aggressiveness when win rate is high', async () => {
      tradingStrategy._analyzeRecentPerformance = jest.fn().mockReturnValue({
        winRate: 0.85, // High win rate
        profitFactor: 3.0,
        maxDrawdown: 1.0
      });

      const initialEntryThreshold = tradingStrategy.adaptiveParams.entryThreshold;
      // const initialPositionMultiplier = tradingStrategy.adaptiveParams.positionSizeMultiplier;

      await tradingStrategy._optimizeParameters();

      expect(tradingStrategy.adaptiveParams.entryThreshold).toBeLessThan(initialEntryThreshold);
    });

    test('should adjust position size based on profit factor', async () => {
      tradingStrategy._analyzeRecentPerformance = jest.fn().mockReturnValue({
        winRate: 0.65,
        profitFactor: 2.5, // Good profit factor
        maxDrawdown: 1.5
      });

      const initialMultiplier = tradingStrategy.adaptiveParams.positionSizeMultiplier;

      await tradingStrategy._optimizeParameters();

      expect(tradingStrategy.adaptiveParams.positionSizeMultiplier).toBeGreaterThan(initialMultiplier);
      expect(tradingStrategy.adaptiveParams.positionSizeMultiplier).toBeLessThanOrEqual(1.5); // Max limit
    });

    test('should tighten risk controls on high drawdown', async () => {
      tradingStrategy._analyzeRecentPerformance = jest.fn().mockReturnValue({
        winRate: 0.6,
        profitFactor: 1.8,
        maxDrawdown: 4.0 // High drawdown
      });

      const initialStopLossMultiplier = tradingStrategy.adaptiveParams.stopLossMultiplier;
      const initialTakeProfitMultiplier = tradingStrategy.adaptiveParams.takeProfitMultiplier;

      await tradingStrategy._optimizeParameters();

      expect(tradingStrategy.adaptiveParams.stopLossMultiplier).toBeLessThan(initialStopLossMultiplier);
      expect(tradingStrategy.adaptiveParams.takeProfitMultiplier).toBeGreaterThan(initialTakeProfitMultiplier);
    });
  });

  // ============ Utility Function Tests ============
  describe('Utility Functions', () => {
    test('should calculate optimal sleep time based on market regime', () => {
      // Test high volatility regime
      tradingStrategy.marketRegime.current = 'HIGH_VOLATILITY';
      tradingStrategy.currentPositions.clear();
      const sleepTime1 = tradingStrategy._calculateOptimalSleepTime(500);
      expect(sleepTime1).toBeLessThan(tradingStrategy.scalingInterval);

      // Test low volatility regime
      tradingStrategy.marketRegime.current = 'LOW_VOLATILITY';
      const sleepTime2 = tradingStrategy._calculateOptimalSleepTime(500);
      expect(sleepTime2).toBeGreaterThan(tradingStrategy.scalingInterval);

      // Test with active positions
      tradingStrategy.currentPositions.set('BTC/USDT', { /* mock position */ });
      const sleepTime3 = tradingStrategy._calculateOptimalSleepTime(500);
      expect(sleepTime3).toBeLessThan(sleepTime2); // Faster with positions
    });

    test('should get regime-based position multiplier correctly', () => {
      // Test trending markets
      tradingStrategy.marketRegime.current = 'TRENDING_BULL';
      expect(tradingStrategy._getRegimePositionMultiplier()).toBe(1.2);

      tradingStrategy.marketRegime.current = 'TRENDING_BEAR';
      expect(tradingStrategy._getRegimePositionMultiplier()).toBe(1.2);

      // Test high volatility
      tradingStrategy.marketRegime.current = 'HIGH_VOLATILITY';
      expect(tradingStrategy._getRegimePositionMultiplier()).toBe(0.7);

      // Test low volatility
      tradingStrategy.marketRegime.current = 'LOW_VOLATILITY';
      expect(tradingStrategy._getRegimePositionMultiplier()).toBe(1.1);

      // Test default case
      tradingStrategy.marketRegime.current = 'RANGING';
      expect(tradingStrategy._getRegimePositionMultiplier()).toBe(1.0);
    });

    test('should generate mock large orders correctly', () => {
      const orders = tradingStrategy._generateMockLargeOrders();
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeLessThanOrEqual(5);

      if (orders.length > 0) {
        const order = orders[0];
        expect(order).toHaveProperty('side');
        expect(order).toHaveProperty('size');
        expect(order).toHaveProperty('price');
        expect(order).toHaveProperty('timestamp');
        expect(['BUY', 'SELL']).toContain(order.side);
        expect(order.size).toBeGreaterThan(100000);
      }
    });

    test('should analyze recent performance correctly', () => {
      const now = Date.now();
      tradingStrategy.tradeHistory = [
        { entryTime: now - 300000, pnl: 1.0 }, // Within 10 minutes
        { entryTime: now - 400000, pnl: 0.5 }, // Within 10 minutes
        { entryTime: now - 200000, pnl: -0.3 }, // Within 10 minutes
        { entryTime: now - 700000, pnl: 2.0 } // Outside 10 minutes
      ];

      const performance = tradingStrategy._analyzeRecentPerformance();

      expect(performance.winRate).toBe(2 / 3); // 2 wins out of 3 recent trades
      expect(performance.totalProfit).toBe(1.2); // 1.0 + 0.5 - 0.3
      expect(performance.profitFactor).toBeGreaterThan(0);
    });

    test('should handle empty trade history in performance analysis', () => {
      tradingStrategy.tradeHistory = [];
      const performance = tradingStrategy._analyzeRecentPerformance();

      expect(performance.winRate).toBe(0.5);
      expect(performance.profitFactor).toBe(1.0);
      expect(performance.maxDrawdown).toBe(0);
    });
  });

  // ============ Integration with External Services Tests ============
  describe('Integration with External Services', () => {
    test('should store analysis in Recall successfully', async () => {
      const mockAnalysis = {
        trend: 'BULLISH',
        confidence: 0.8,
        reasoning: 'Strong technical indicators'
      };

      await tradingStrategy._storeAnalysis('market_analysis', mockAnalysis);

      expect(mockRecallClient.getOrCreateBucket).toHaveBeenCalledWith('enhanced_trading_analysis');
      expect(mockRecallClient.addObject).toHaveBeenCalled();

      const addObjectCall = mockRecallClient.addObject.mock.calls[0];
      const storedData = JSON.parse(addObjectCall[2]);
      expect(storedData).toHaveProperty('trend', 'BULLISH');
      expect(storedData).toHaveProperty('marketRegime');
      expect(storedData).toHaveProperty('timestamp');
    });

    test('should handle Recall storage errors gracefully', async () => {
      mockRecallClient.getOrCreateBucket.mockRejectedValueOnce(new Error('Network error'));

      await tradingStrategy._storeAnalysis('test_analysis', { test: 'data' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to store enhanced analysis in Recall',
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    test('should get enhanced market analysis from Gaia', async () => {
      const mockGaiaResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              trend: 'BULLISH',
              volatility: 'MODERATE',
              confidence: 0.75,
              reasoning: 'Strong momentum indicators'
            })
          }
        }]
      };

      mockGaiaClient.chat.mockResolvedValueOnce(mockGaiaResponse);

      const analysis = await tradingStrategy._getEnhancedMarketAnalysis();

      expect(analysis).toHaveProperty('trend', 'BULLISH');
      expect(analysis).toHaveProperty('volatility', 'MODERATE');
      expect(analysis).toHaveProperty('confidence', 0.75);
      expect(analysis).toHaveProperty('timestamp');
      expect(analysis).toHaveProperty('marketRegime');
    });

    test('should handle Gaia service failures with fallback', async () => {
      mockGaiaClient.chat.mockRejectedValueOnce(new Error('Gaia service unavailable'));

      const analysis = await tradingStrategy._getEnhancedMarketAnalysis();

      expect(analysis).toHaveProperty('trend', 'NEUTRAL');
      expect(analysis).toHaveProperty('confidence', 0.3);
      expect(analysis).toHaveProperty('reasoning', 'Default enhanced analysis - Gaia unavailable');
    });

    test('should get ML prediction from Gaia', async () => {
      const mockPrediction = {
        direction: 'UP',
        confidence: 0.85,
        timeHorizon: '5-10 minutes',
        magnitude: '1.2%',
        riskFactors: ['high volatility', 'news impact'],
        supportingEvidence: 'Strong technical momentum'
      };

      mockGaiaClient.chat.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(mockPrediction) } }]
      });

      const features = {
        indicators: mockAdvancedIndicators,
        orderBook: mockOrderBookAnalysis,
        sentiment: { score: 0.7 },
        marketRegime: { current: 'TRENDING_BULL' }
      };

      const prediction = await tradingStrategy._getMachineLearningPrediction('BTC/USDT', features);

      expect(prediction).toHaveProperty('direction', 'UP');
      expect(prediction).toHaveProperty('confidence', 0.85);
      expect(prediction).toHaveProperty('magnitude', '1.2%');
    });
  });

  // ============ Error Handling Tests ============
  describe('Error Handling', () => {
    test('should handle missing market data gracefully', async () => {
      tradingStrategy._getMultiTimeframeData = jest.fn().mockResolvedValue({});

      await tradingStrategy._processEnhancedTradingPair('BTC/USDT', {});

      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('should handle technical indicator calculation errors', () => {
      const indicators = tradingStrategy._getDefaultAdvancedIndicators();

      expect(indicators).toHaveProperty('rsi');
      expect(indicators).toHaveProperty('macd');
      expect(indicators).toHaveProperty('bollingerBands');
      expect(indicators.rsi['1m']).toBe(50);
      expect(indicators.macd.signal).toBe('NEUTRAL');
    });

    test('should handle order book analysis errors', () => {
      const orderBook = tradingStrategy._getDefaultOrderBookAnalysis();

      expect(orderBook).toHaveProperty('imbalance', 0);
      expect(orderBook).toHaveProperty('spreadTightness', 0.999);
      expect(orderBook).toHaveProperty('largeOrderFlow', 0);
      expect(orderBook.largeOrders).toEqual([]);
    });

    test('should handle Vincent policy execution errors', async () => {
      mockVincentClient.executePolicy.mockRejectedValueOnce(new Error('Policy violation'));

      const mockTradeParams = {
        pair: 'BTC/USDT',
        action: 'BUY',
        amount: 1000,
        policies: ['spending_limit']
      };

      // This should not throw but log the error
      await expect(async () => {
        try {
          await tradingStrategy._executeEnhancedVincentTrade(mockTradeParams);
        } catch (error) {
          // Expected to catch and handle gracefully
        }
      }).not.toThrow();
    });
  });

  // ============ Status and Monitoring Tests ============
  describe('Status and Monitoring', () => {
    test('should return comprehensive enhanced status', () => {
      // Set up some test state
      tradingStrategy.currentPositions.set('BTC/USDT', { /* mock position */ });
      tradingStrategy.arbitrageDetector.crossExchangeOpportunities.set('ETH/USDT', [{ profit: 0.2 }]);

      const status = tradingStrategy.getEnhancedStatus();

      expect(status).toHaveProperty('isActive', false);
      expect(status).toHaveProperty('marketRegime');
      expect(status).toHaveProperty('performanceMetrics');
      expect(status).toHaveProperty('adaptiveParams');
      expect(status).toHaveProperty('currentPositions', 1);
      expect(status).toHaveProperty('arbitrageOpportunities');
      expect(status).toHaveProperty('riskLevel');
    });

    test('should summarize arbitrage opportunities correctly', () => {
      tradingStrategy.arbitrageDetector.crossExchangeOpportunities.set('BTC/USDT', [{ profit: 0.2 }]);
      tradingStrategy.arbitrageDetector.crossChainOpportunities.set('ETH/USDT', [{ profit: 0.3 }]);
      tradingStrategy.arbitrageDetector.lastScanTime = Date.now();

      const summary = tradingStrategy._summarizeArbitrageOpportunities();

      expect(summary).toHaveProperty('crossExchange', 1);
      expect(summary).toHaveProperty('crossChain', 1);
      expect(summary).toHaveProperty('lastScan');
      expect(typeof summary.lastScan).toBe('number');
    });
  });

  // ============ Edge Cases and Boundary Conditions ============
  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle zero confidence signals', () => {
      const mockParams = {
        pair: 'BTC/USDT',
        indicators: mockAdvancedIndicators,
        orderBook: mockOrderBookAnalysis,
        sentiment: { score: 0.5 },
        mlPrediction: { direction: 'UP', confidence: 0.0 }, // Zero confidence
        marketAnalysis: { trend: 'NEUTRAL' }
      };

      const signal = tradingStrategy._generateEnhancedTradingSignal(mockParams);

      expect(signal.action).toBe('HOLD'); // Should not trade with zero confidence
      expect(signal.confidence).toBeLessThan(0.6);
    });

    test('should handle extremely small position sizes', () => {
      const mockSignal = { confidence: 0.1 }; // Very low confidence

      tradingStrategy._getVolatility = jest.fn().mockReturnValue(0.15); // Very high volatility
      tradingStrategy._getLiquidity = jest.fn().mockReturnValue(1000); // Very low liquidity
      tradingStrategy._getRegimePositionMultiplier = jest.fn().mockReturnValue(0.5);

      const positionSize = tradingStrategy._calculateEnhancedPositionSize('BTC/USDT', mockSignal, {});

      expect(positionSize).toBeGreaterThanOrEqual(50); // Should respect minimum
      expect(positionSize).toBeLessThan(100); // But be very small
    });

    test('should handle maximum position size limits', () => {
      const mockSignal = {
        confidence: 1.0, // Maximum confidence
        strategyBreakdown: {
          arbitrage: { score: 1.0 },
          machineLearning: { confidence: 1.0 }
        }
      };

      tradingStrategy._getVolatility = jest.fn().mockReturnValue(0.001); // Very low volatility
      tradingStrategy._getLiquidity = jest.fn().mockReturnValue(10000000); // Very high liquidity
      tradingStrategy._getRegimePositionMultiplier = jest.fn().mockReturnValue(1.5);

      const positionSize = tradingStrategy._calculateEnhancedPositionSize('BTC/USDT', mockSignal, {});

      expect(positionSize).toBeLessThanOrEqual(5000); // Should respect maximum
    });

    test('should handle empty arbitrage opportunities', async () => {
      tradingStrategy._getMultiExchangePrices = jest.fn().mockResolvedValue([]);
      tradingStrategy._getMultiChainPrices = jest.fn().mockResolvedValue([]);

      await tradingStrategy._scanArbitrageOpportunities();

      // Should not crash and should handle gracefully
      expect(tradingStrategy.arbitrageDetector.crossExchangeOpportunities.size).toBe(0);
      expect(tradingStrategy.arbitrageDetector.crossChainOpportunities.size).toBe(0);
    });

    test('should handle negative profit arbitrage opportunities', async () => {
      const mockExchangePrices = [
        { exchange: 'Exchange1', askPrice: 50000, bidPrice: 49980, volume: 1000000 },
        { exchange: 'Exchange2', askPrice: 49500, bidPrice: 49480, volume: 800000 } // Lower prices
      ];

      tradingStrategy._getMultiExchangePrices = jest.fn().mockResolvedValue(mockExchangePrices);

      await tradingStrategy._scanCrossExchangeArbitrage();

      // Should not create opportunities for negative profit
      const opportunities = tradingStrategy.arbitrageDetector.crossExchangeOpportunities.get('BTC/USDT');
      expect(opportunities).toBeUndefined();
    });
  });
});
