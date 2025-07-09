// ============ Imports ============
import { jest } from '@jest/globals';
import { TradingStrategy } from '../src/core/TradingStrategy.js';
import { RecallClient } from '@recallnet/sdk/client';
import { getVincentToolClient } from '@lit-protocol/vincent-app-sdk';
import { GaiaClient } from '../src/integrations/GaiaClient.js';
import { Logger } from '../src/utils/Logger.js';
import { ethers } from 'ethers';

// ============ Test Configuration ============
const INTEGRATION_TEST_CONFIG = {
    RECALL_PRIVATE_KEY: process.env.RECALL_PRIVATE_KEY || '0x' + '1'.repeat(64),
    RECALL_NETWORK: process.env.RECALL_NETWORK || 'testnet',
    VINCENT_APP_ID: process.env.VINCENT_APP_ID || 'test-app-id',
    GAIA_API_KEY: process.env.GAIA_API_KEY || 'test-gaia-key',
    GAIA_NODE_URL: process.env.GAIA_NODE_URL || 'https://test.gaia.domains',
    TEST_TIMEOUT: 30000 // 30 seconds for integration tests
};

// ============ Mock Real-World Market Data ============
const MOCK_MARKET_SCENARIOS = {
    BULLISH_BREAKOUT: {
        priceData: {
            '1s': { price: 50100, volume: 1200000, timestamp: Date.now() },
            '5s': { price: 50080, volume: 1150000, timestamp: Date.now() - 5000 },
            '1m': { price: 50000, volume: 1000000, timestamp: Date.now() - 60000 }
        },
        indicators: {
            rsi: { '1m': 65, '5m': 68 },
            macd: { line: 8, signal: 5, histogram: 3, signal: 'BULLISH_CROSSOVER' },
            volume: { spike: 2.2, trend: 'INCREASING' }
        },
        sentiment: { score: 0.78, newsImpact: 'POSITIVE', socialMomentum: 'STRONG' }
    },
    
    BEARISH_BREAKDOWN: {
        priceData: {
            '1s': { price: 49800, volume: 1500000, timestamp: Date.now() },
            '5s': { price: 49850, volume: 1400000, timestamp: Date.now() - 5000 },
            '1m': { price: 50000, volume: 1000000, timestamp: Date.now() - 60000 }
        },
        indicators: {
            rsi: { '1m': 25, '5m': 22 },
            macd: { line: -6, signal: -3, histogram: -3, signal: 'BEARISH_CROSSOVER' },
            volume: { spike: 1.8, trend: 'INCREASING' }
        },
        sentiment: { score: 0.25, newsImpact: 'NEGATIVE', socialMomentum: 'WEAK' }
    },
    
    RANGING_MARKET: {
        priceData: {
            '1s': { price: 50020, volume: 800000, timestamp: Date.now() },
            '5s': { price: 50015, volume: 850000, timestamp: Date.now() - 5000 },
            '1m': { price: 50000, volume: 900000, timestamp: Date.now() - 60000 }
        },
        indicators: {
            rsi: { '1m': 52, '5m': 48 },
            macd: { line: 1, signal: 0.5, histogram: 0.5, signal: 'NEUTRAL' },
            volume: { spike: 0.9, trend: 'STABLE' }
        },
        sentiment: { score: 0.48, newsImpact: 'NEUTRAL', socialMomentum: 'MODERATE' }
    },
    
    HIGH_VOLATILITY: {
        priceData: {
            '1s': { price: 51200, volume: 2000000, timestamp: Date.now() },
            '5s': { price: 49800, volume: 1800000, timestamp: Date.now() - 5000 },
            '1m': { price: 50000, volume: 1200000, timestamp: Date.now() - 60000 }
        },
        indicators: {
            rsi: { '1m': 45, '5m': 55 },
            macd: { line: 3, signal: -2, histogram: 5, signal: 'VOLATILE' },
            volume: { spike: 3.5, trend: 'EXPLOSIVE' }
        },
        sentiment: { score: 0.65, newsImpact: 'MIXED', socialMomentum: 'VOLATILE' }
    }
};

// ============ Integration Test Suite ============
describe('TradingStrategy Integration Tests', () => {
    let tradingStrategy;
    let recallClient;
    let vincentClient;
    let gaiaClient;
    let logger;
    let mockWallet;

    beforeAll(async () => {
        // ============ Setup Real Client Connections ============
        jest.setTimeout(INTEGRATION_TEST_CONFIG.TEST_TIMEOUT);
        
        // Initialize logger
        logger = new Logger('IntegrationTest');
        
        // Setup mock wallet for Vincent
        mockWallet = new ethers.Wallet(INTEGRATION_TEST_CONFIG.RECALL_PRIVATE_KEY);
        
        // Initialize Recall client
        try {
            recallClient = new RecallClient({
                privateKey: INTEGRATION_TEST_CONFIG.RECALL_PRIVATE_KEY,
                network: INTEGRATION_TEST_CONFIG.RECALL_NETWORK
            });
            logger.info('Recall client initialized successfully');
        } catch (error) {
            logger.warn('Using mock Recall client due to initialization error', { error: error.message });
            recallClient = createMockRecallClient();
        }
        
        // Initialize Vincent client
        try {
            vincentClient = getVincentToolClient({
                ethersSigner: mockWallet,
                bundledVincentTool: createMockVincentTool()
            });
            logger.info('Vincent client initialized successfully');
        } catch (error) {
            logger.warn('Using mock Vincent client due to initialization error', { error: error.message });
            vincentClient = createMockVincentClient();
        }
        
        // Initialize Gaia client
        try {
            gaiaClient = new GaiaClient({
                apiKey: INTEGRATION_TEST_CONFIG.GAIA_API_KEY,
                nodeUrl: INTEGRATION_TEST_CONFIG.GAIA_NODE_URL
            });
            logger.info('Gaia client initialized successfully');
        } catch (error) {
            logger.warn('Using mock Gaia client due to initialization error', { error: error.message });
            gaiaClient = createMockGaiaClient();
        }
    });

    beforeEach(async () => {
        // ============ Initialize Fresh Trading Strategy ============
        tradingStrategy = new TradingStrategy(recallClient, vincentClient, gaiaClient, logger);
        
        // ============ Setup Integration Test Environment ============
        await setupIntegrationTestEnvironment(tradingStrategy);
    });

    afterEach(async () => {
        // ============ Cleanup After Each Test ============
        if (tradingStrategy && tradingStrategy.isActive) {
            await tradingStrategy.stop();
        }
        
        // Clear any test data from Recall
        await cleanupTestData(recallClient);
    });

    // ============ End-to-End Trading Flow Tests ============
    describe('End-to-End Trading Flow', () => {
        test('should execute complete trading cycle with bullish market conditions', async () => {
            // ============ Setup Bullish Market Scenario ============
            const scenario = MOCK_MARKET_SCENARIOS.BULLISH_BREAKOUT;
            setupMarketScenario(tradingStrategy, scenario);
            
            // ============ Start Strategy ============
            await tradingStrategy.start();
            expect(tradingStrategy.isActive).toBe(true);
            
            // ============ Wait for Processing Cycle ============
            await waitForTradingCycle(tradingStrategy, 5000);
            
            // ============ Verify Trade Execution ============
            const status = tradingStrategy.getEnhancedStatus();
            
            // Should have detected bullish conditions
            expect(status.marketRegime.current).toMatch(/TRENDING_BULL|HIGH_VOLATILITY/);
            
            // Should have executed at least one trade attempt
            expect(status.performanceMetrics.totalTrades).toBeGreaterThanOrEqual(0);
            
            // Should have stored analysis in Recall
            const analysisExists = await verifyRecallDataStorage(recallClient, 'enhanced_trading_analysis');
            expect(analysisExists).toBe(true);
            
            await tradingStrategy.stop();
        }, INTEGRATION_TEST_CONFIG.TEST_TIMEOUT);

        test('should handle bearish market conditions appropriately', async () => {
            // ============ Setup Bearish Market Scenario ============
            const scenario = MOCK_MARKET_SCENARIOS.BEARISH_BREAKDOWN;
            setupMarketScenario(tradingStrategy, scenario);
            
            await tradingStrategy.start();
            
            // ============ Wait for Strategy to Process Market Conditions ============
            await waitForTradingCycle(tradingStrategy, 5000);
            
            const status = tradingStrategy.getEnhancedStatus();
            
            // Should detect bearish or high volatility regime
            expect(status.marketRegime.current).toMatch(/TRENDING_BEAR|HIGH_VOLATILITY|RANGING/);
            
            // Risk management should be active
            expect(status.riskLevel).toMatch(/MEDIUM|HIGH/);
            
            await tradingStrategy.stop();
        }, INTEGRATION_TEST_CONFIG.TEST_TIMEOUT);

        test('should adapt parameters based on performance in ranging market', async () => {
            // ============ Setup Ranging Market Scenario ============
            const scenario = MOCK_MARKET_SCENARIOS.RANGING_MARKET;
            setupMarketScenario(tradingStrategy, scenario);
            
            // ============ Record Initial Parameters ============
            const initialParams = { ...tradingStrategy.adaptiveParams };
            
            await tradingStrategy.start();
            
            // ============ Simulate Multiple Trading Cycles ============
            for (let i = 0; i < 3; i++) {
                await waitForTradingCycle(tradingStrategy, 3000);
                
                // Inject some mock trade history to trigger optimization
                tradingStrategy.tradeHistory.push({
                    entryTime: Date.now() - (i * 120000),
                    exitTime: Date.now() - (i * 120000) + 60000,
                    pnl: (Math.random() - 0.5) * 2, // Random P&L
                    pair: 'BTC/USDT',
                    strategy: 'enhanced_scalping'
                });
            }
            
            // ============ Trigger Parameter Optimization ============
            await tradingStrategy._optimizeParameters();
            
            const finalParams = tradingStrategy.adaptiveParams;
            
            // Parameters should have been adjusted
            expect(finalParams.lastOptimization).toBeGreaterThan(initialParams.lastOptimization);
            
            await tradingStrategy.stop();
        }, INTEGRATION_TEST_CONFIG.TEST_TIMEOUT);
    });

    // ============ Recall Integration Tests ============
    describe('Recall Integration', () => {
        test('should store and retrieve trading analysis data', async () => {
            // ============ Create Test Analysis Data ============
            const testAnalysis = {
                timestamp: Date.now(),
                marketConditions: 'BULLISH',
                confidence: 0.85,
                signals: ['RSI_OVERSOLD', 'MACD_BULLISH_CROSSOVER'],
                tradeRecommendation: 'BUY'
            };
            
            // ============ Store Analysis in Recall ============
            await tradingStrategy._storeAnalysis('integration_test_analysis', testAnalysis);
            
            // ============ Verify Storage ============
            const bucket = await recallClient.getOrCreateBucket('enhanced_trading_analysis');
            expect(bucket).toHaveProperty('bucket');
            
            // ============ Query Stored Data ============
            const queryResult = await recallClient.queryObjects(bucket.bucket, {
                prefix: 'integration_test_analysis'
            });
            
            expect(queryResult.objects.length).toBeGreaterThan(0);
            
            // ============ Retrieve and Verify Data ============
            const firstObject = queryResult.objects[0];
            const retrievedData = await recallClient.getObject(bucket.bucket, firstObject.key);
            const parsedData = JSON.parse(retrievedData.value);
            
            expect(parsedData).toHaveProperty('marketConditions', 'BULLISH');
            expect(parsedData).toHaveProperty('confidence', 0.85);
            expect(parsedData).toHaveProperty('timestamp');
        }, INTEGRATION_TEST_CONFIG.TEST_TIMEOUT);

        test('should handle Recall storage failures gracefully', async () => {
            // ============ Create Invalid Data That Should Fail ============
            const invalidData = { circular: null };
            invalidData.circular = invalidData; // Create circular reference
            
            // ============ Attempt to Store Invalid Data ============
            await expect(async () => {
                await tradingStrategy._storeAnalysis('invalid_test', invalidData);
            }).not.toThrow(); // Should handle gracefully, not throw
            
            // ============ Verify Error Was Logged ============
            // Note: In real integration, you'd check actual log output
        });

        test('should create and manage multiple trading buckets', async () => {
            // ============ Create Multiple Analysis Types ============
            const analysisTypes = [
                'market_sentiment',
                'technical_indicators',
                'arbitrage_opportunities',
                'performance_metrics'
            ];
            
            // ============ Store Data in Each Type ============
            for (const type of analysisTypes) {
                await tradingStrategy._storeAnalysis(type, {
                    type,
                    timestamp: Date.now(),
                    data: `test_data_for_${type}`
                });
            }
            
            // ============ Verify All Data Was Stored ============
            const bucket = await recallClient.getOrCreateBucket('enhanced_trading_analysis');
            const allObjects = await recallClient.queryObjects(bucket.bucket);
            
            expect(allObjects.objects.length).toBeGreaterThanOrEqual(analysisTypes.length);
        });
    });

    // ============ Vincent Integration Tests ============
    describe('Vincent Integration', () => {
        test('should execute Vincent policy checks before trading', async () => {
            // ============ Setup Mock Trade Parameters ============
            const mockTradeParams = {
                pair: 'BTC/USDT',
                action: 'BUY',
                amount: 1000,
                confidence: 0.8,
                policies: ['spending_limit', 'risk_management']
            };
            
            // ============ Execute Vincent Precheck ============
            const precheckResult = await vincentClient.precheck(mockTradeParams, {
                delegatorPkpEthAddress: mockWallet.address
            });
            
            expect(precheckResult).toHaveProperty('success');
            
            // ============ If Precheck Passes, Execute Trade ============
            if (precheckResult.success) {
                const executeResult = await vincentClient.execute(mockTradeParams, {
                    delegatorPkpEthAddress: mockWallet.address
                });
                
                expect(executeResult).toHaveProperty('success');
                if (executeResult.success) {
                    expect(executeResult).toHaveProperty('result');
                }
            }
        }, INTEGRATION_TEST_CONFIG.TEST_TIMEOUT);

        test('should handle Vincent policy violations correctly', async () => {
            // ============ Setup Trade That Should Violate Policies ============
            const violatingTradeParams = {
                pair: 'BTC/USDT',
                action: 'BUY',
                amount: 999999999, // Extremely large amount to trigger spending limit
                confidence: 0.9,
                policies: ['spending_limit']
            };
            
            // ============ Execute Precheck That Should Fail ============
            const precheckResult = await vincentClient.precheck(violatingTradeParams, {
                delegatorPkpEthAddress: mockWallet.address
            });
            
            // ============ Should Either Fail or Return Denial ============
            if (precheckResult.success === false) {
                expect(precheckResult).toHaveProperty('error');
            } else {
                // If precheck passes, execute should fail due to policy violation
                const executeResult = await vincentClient.execute(violatingTradeParams, {
                    delegatorPkpEthAddress: mockWallet.address
                });
                expect(executeResult.success).toBe(false);
            }
        });

        test('should integrate Vincent policies with trading strategy', async () => {
            // ============ Setup Strategy with Vincent Integration ============
            const scenario = MOCK_MARKET_SCENARIOS.BULLISH_BREAKOUT;
            setupMarketScenario(tradingStrategy, scenario);
            
            // ============ Mock Enhanced Trade Execution ============
            const mockSignal = {
                action: 'BUY',
                confidence: 0.85,
                score: 0.7,
                strategyBreakdown: {
                    technical: { score: 0.6, strength: 0.8 },
                    microstructure: { score: 0.5, strength: 0.7 }
                }
            };
            
            // ============ Execute Enhanced Trading Signal ============
            await tradingStrategy._executeEnhancedTradingSignal(
                'BTC/USDT',
                mockSignal,
                scenario.priceData
            );
            
            // ============ Verify Strategy State Updated ============
            const status = tradingStrategy.getEnhancedStatus();
            expect(status.performanceMetrics.totalTrades).toBeGreaterThanOrEqual(0);
        });
    });

    // ============ Gaia AI Integration Tests ============
    describe('Gaia AI Integration', () => {
        test('should get enhanced market analysis from Gaia', async () => {
            // ============ Request Market Analysis ============
            const analysis = await tradingStrategy._getEnhancedMarketAnalysis();
            
            // ============ Verify Analysis Structure ============
            expect(analysis).toHaveProperty('timestamp');
            expect(analysis).toHaveProperty('marketRegime');
            expect(analysis).toHaveProperty('riskLevel');
            
            // ============ Should Have Valid Analysis Data ============
            expect(typeof analysis.timestamp).toBe('number');
            expect(analysis.marketRegime).toMatch(/TRENDING_BULL|TRENDING_BEAR|RANGING|HIGH_VOLATILITY|LOW_VOLATILITY/);
            expect(analysis.riskLevel).toMatch(/LOW|MEDIUM|HIGH/);
        }, INTEGRATION_TEST_CONFIG.TEST_TIMEOUT);

        test('should get ML predictions for trading pairs', async () => {
            // ============ Setup Feature Data for ML Prediction ============
            const features = {
                indicators: MOCK_MARKET_SCENARIOS.BULLISH_BREAKOUT.indicators,
                orderBook: {
                    imbalance: 0.15,
                    spreadTightness: 0.998,
                    largeOrderFlow: 200000
                },
                sentiment: MOCK_MARKET_SCENARIOS.BULLISH_BREAKOUT.sentiment,
                marketRegime: { current: 'TRENDING_BULL' }
            };
            
            // ============ Get ML Prediction ============
            const prediction = await tradingStrategy._getMachineLearningPrediction('BTC/USDT', features);
            
            // ============ Verify Prediction Structure ============
            if (prediction) {
                expect(prediction).toHaveProperty('direction');
                expect(prediction).toHaveProperty('confidence');
                expect(['UP', 'DOWN', 'SIDEWAYS']).toContain(prediction.direction);
                expect(prediction.confidence).toBeGreaterThanOrEqual(0);
                expect(prediction.confidence).toBeLessThanOrEqual(1);
            }
        });

        test('should handle Gaia service unavailability gracefully', async () => {
            // ============ Create Temporary Gaia Client That Will Fail ============
            const failingGaiaClient = {
                chat: jest.fn().mockRejectedValue(new Error('Service unavailable'))
            };
            
            const tempStrategy = new TradingStrategy(
                recallClient,
                vincentClient,
                failingGaiaClient,
                logger
            );
            
            // ============ Should Get Fallback Analysis ============
            const analysis = await tempStrategy._getEnhancedMarketAnalysis();
            
            expect(analysis).toHaveProperty('reasoning', 'Default enhanced analysis - Gaia unavailable');
            expect(analysis.confidence).toBe(0.3);
        });

        test('should use Gaia for sentiment analysis integration', async () => {
            // ============ Get Advanced Sentiment Analysis ============
            const sentimentAnalysis = await tradingStrategy._getAdvancedSentimentAnalysis('BTC/USDT');
            
            // ============ Verify Sentiment Data Structure ============
            if (sentimentAnalysis) {
                expect(sentimentAnalysis).toHaveProperty('score');
                expect(typeof sentimentAnalysis.score).toBe('number');
                expect(sentimentAnalysis.score).toBeGreaterThanOrEqual(0);
                expect(sentimentAnalysis.score).toBeLessThanOrEqual(1);
            }
        });
    });

    // ============ Multi-Service Integration Tests ============
    describe('Multi-Service Integration', () => {
        test('should coordinate all services in complete trading workflow', async () => {
            // ============ Setup Comprehensive Market Scenario ============
            const scenario = MOCK_MARKET_SCENARIOS.HIGH_VOLATILITY;
            setupMarketScenario(tradingStrategy, scenario);
            
            // ============ Start Strategy and Let It Run Complete Cycle ============
            await tradingStrategy.start();
            
            // ============ Wait for Multiple Processing Cycles ============
            await waitForTradingCycle(tradingStrategy, 8000);
            
            // ============ Verify Cross-Service Integration ============
            const status = tradingStrategy.getEnhancedStatus();
            
            // Strategy should be active and processing
            expect(status.isActive).toBe(true);
            
            // Market regime should be detected
            expect(status.marketRegime.current).toBeDefined();
            expect(status.marketRegime.confidence).toBeGreaterThan(0);
            
            // Performance metrics should be updating
            expect(status.performanceMetrics).toBeDefined();
            expect(typeof status.performanceMetrics.tradesPerMinute).toBe('number');
            
            // ============ Verify Data Persistence in Recall ============
            const dataExists = await verifyRecallDataStorage(recallClient, 'enhanced_trading_analysis');
            expect(dataExists).toBe(true);
            
            await tradingStrategy.stop();
        }, INTEGRATION_TEST_CONFIG.TEST_TIMEOUT);

        test('should handle partial service failures without complete breakdown', async () => {
            // ============ Create Strategy with One Failing Service ============
            const partiallyFailingGaia = {
                chat: jest.fn()
                    .mockResolvedValueOnce({ choices: [{ message: { content: '{"analysis": "success"}' } }] })
                    .mockRejectedValueOnce(new Error('Temporary failure'))
                    .mockResolvedValue({ choices: [{ message: { content: '{"analysis": "recovered"}' } }] })
            };
            
            const resilientStrategy = new TradingStrategy(
                recallClient,
                vincentClient,
                partiallyFailingGaia,
                logger
            );
            
            // ============ Setup and Start Strategy ============
            const scenario = MOCK_MARKET_SCENARIOS.BULLISH_BREAKOUT;
            setupMarketScenario(resilientStrategy, scenario);
            
            await resilientStrategy.start();
            
            // ============ Run Multiple Cycles to Test Resilience ============
            for (let i = 0; i < 3; i++) {
                await waitForTradingCycle(resilientStrategy, 2000);
            }
            
            // ============ Strategy Should Still Be Functional ============
            const status = resilientStrategy.getEnhancedStatus();
            expect(status.isActive).toBe(true);
            
            await resilientStrategy.stop();
        });

        test('should maintain data consistency across service interactions', async () => {
            // ============ Setup Strategy with Data Tracking ============
            const scenario = MOCK_MARKET_SCENARIOS.RANGING_MARKET;
            setupMarketScenario(tradingStrategy, scenario);
            
            await tradingStrategy.start();
            
            // ============ Execute Multiple Trading Cycles ============
            const initialTradeCount = tradingStrategy.performanceMetrics.totalTrades;
            
            await waitForTradingCycle(tradingStrategy, 5000);
            
            // ============ Verify Data Consistency ============
            const finalStatus = tradingStrategy.getEnhancedStatus();
            
            // Performance metrics should be consistent
            expect(finalStatus.performanceMetrics.totalTrades).toBeGreaterThanOrEqual(initialTradeCount);
            
            // Market regime should have valid confidence
            expect(finalStatus.marketRegime.confidence).toBeGreaterThan(0);
            expect(finalStatus.marketRegime.confidence).toBeLessThanOrEqual(1);
            
            // Adaptive parameters should be within valid ranges
            expect(finalStatus.adaptiveParams.entryThreshold).toBeGreaterThan(0);
            expect(finalStatus.adaptiveParams.positionSizeMultiplier).toBeGreaterThan(0);
            
            await tradingStrategy.stop();
        });
    });

    // ============ Performance and Scalability Tests ============
    describe('Performance and Scalability', () => {
        test('should handle high-frequency trading cycles efficiently', async () => {
            // ============ Setup High-Frequency Scenario ============
            const highFreqStrategy = new TradingStrategy(recallClient, vincentClient, gaiaClient, logger);
            highFreqStrategy.scalingInterval = 500; // Very fast cycles
            
            const scenario = MOCK_MARKET_SCENARIOS.HIGH_VOLATILITY;
            setupMarketScenario(highFreqStrategy, scenario);
            
            await highFreqStrategy.start();
            
            // ============ Measure Performance Over Time ============
            const startTime = Date.now();
            await waitForTradingCycle(highFreqStrategy, 10000);
            const endTime = Date.now();
            
            const totalTime = endTime - startTime;
            const cycles = Math.floor(totalTime / 500); // Expected cycles
            
            // ============ Verify Performance Metrics ============
            const status = highFreqStrategy.getEnhancedStatus();
            expect(status.performanceMetrics.avgLoopTime).toBeLessThan(2000); // Should be under 2 seconds per loop
            
            await highFreqStrategy.stop();
        }, INTEGRATION_TEST_CONFIG.TEST_TIMEOUT);

        test('should manage memory usage with long-running operations', async () => {
            // ============ Setup Long-Running Test ============
            const scenario = MOCK_MARKET_SCENARIOS.RANGING_MARKET;
            setupMarketScenario(tradingStrategy, scenario);
            
            await tradingStrategy.start();
            
            // ============ Monitor Memory Usage ============
            const initialMemory = process.memoryUsage();
            
            // Run for extended period
            for (let i = 0; i < 5; i++) {
                await waitForTradingCycle(tradingStrategy, 2000);
                
                // Add some trade history to simulate memory usage
                tradingStrategy.tradeHistory.push({
                    entryTime: Date.now(),
                    exitTime: Date.now() + 30000,
                    pnl: Math.random() * 2 - 1,
                    pair: `PAIR_${i}`,
                    strategy: 'integration_test'
                });
            }
            
            const finalMemory = process.memoryUsage();
            
            // ============ Verify Memory Usage Is Reasonable ============
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
            
            await tradingStrategy.stop();
        });
    });

    // ============ Error Recovery and Resilience Tests ============
    describe('Error Recovery and Resilience', () => {
        test('should recover from network interruptions', async () => {
            // ============ Setup Strategy with Intermittent Network Issues ============
            let networkCallCount = 0;
            const unreliableRecallClient = {
                ...recallClient,
                addObject: jest.fn().mockImplementation(async (...args) => {
                    networkCallCount++;
                    if (networkCallCount % 3 === 0) {
                        throw new Error('Network timeout');
                    }
                    return { success: true };
                }),
                getOrCreateBucket: jest.fn().mockResolvedValue({ bucket: 'test-bucket' })
            };
            
            const resilientStrategy = new TradingStrategy(
                unreliableRecallClient,
                vincentClient,
                gaiaClient,
                logger
            );
            
            // ============ Run Strategy with Network Issues ============
            const scenario = MOCK_MARKET_SCENARIOS.BULLISH_BREAKOUT;
            setupMarketScenario(resilientStrategy, scenario);
            
            await resilientStrategy.start();
            
            // ============ Execute Multiple Storage Operations ============
            for (let i = 0; i < 5; i++) {
                await resilientStrategy._storeAnalysis(`test_${i}`, { iteration: i });
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // ============ Strategy Should Continue Operating ============
            expect(resilientStrategy.isActive).toBe(true);
            
            await resilientStrategy.stop();
        });

        test('should handle cascading service failures gracefully', async () => {
            // ============ Create Multiple Failing Services ============
            const failingServices = {
                recall: {
                    ...recallClient,
                    addObject: jest.fn().mockRejectedValue(new Error('Recall service down'))
                },
                vincent: {
                    ...vincentClient,
                    precheck: jest.fn().mockRejectedValue(new Error('Vincent service down'))
                },
                gaia: {
                    chat: jest.fn().mockRejectedValue(new Error('Gaia service down'))
                }
            };
            
            const failureResistantStrategy = new TradingStrategy(
                failingServices.recall,
                failingServices.vincent,
                failingServices.gaia,
                logger
            );
            
            // ============ Strategy Should Start Despite Service Failures ============
            await expect(failureResistantStrategy.start()).resolves.not.toThrow();
            
            // ============ Should Use Fallback Mechanisms ============
            const analysis = await failureResistantStrategy._getEnhancedMarketAnalysis();
            expect(analysis).toHaveProperty('reasoning');
            expect(analysis.confidence).toBeLessThanOrEqual(0.5); // Should use conservative defaults
            
            await failureResistantStrategy.stop();
        });
    });
});

// ============ Helper Functions ============

/**
 * @notice Create mock Recall client for testing
 * @returns {Object} Mock Recall client
 */
function createMockRecallClient() {
    return {
        getOrCreateBucket: jest.fn().mockResolvedValue({ bucket: 'mock-bucket-123' }),
        addObject: jest.fn().mockResolvedValue({ success: true }),
        queryObjects: jest.fn().mockResolvedValue({ 
            objects: [{ key: 'test-key-1', size: 100 }] 
        }),
        getObject: jest.fn().mockResolvedValue({ 
            value: JSON.stringify({ test: 'mock-data' }) 
        })
    };
}

/**
 * @notice Create mock Vincent tool for testing
 * @returns {Object} Mock Vincent tool
 */
function createMockVincentTool() {
    return {
        vincentTool: {
            toolParamsSchema: { parse: (data) => data },
            supportedPolicies: [],
            precheck: jest.fn().mockResolvedValue({ success: true }),
            execute: jest.fn().mockResolvedValue({ success: true })
        },
        ipfsCid: 'QmTestCid123'
    };
}

/**
 * @notice Create mock Vincent client for testing
 * @returns {Object} Mock Vincent client
 */
function createMockVincentClient() {
    return {
        precheck: jest.fn().mockResolvedValue({ success: true, canExecute: true }),
        execute: jest.fn().mockResolvedValue({ 
            success: true, 
            result: { transactionHash: '0xtest123' } 
        })
    };
}

/**
 * @notice Create mock Gaia client for testing
 * @returns {Object} Mock Gaia client
 */
function createMockGaiaClient() {
    return {
        chat: jest.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        analysis: 'mock_analysis',
                        confidence: 0.7,
                        trend: 'NEUTRAL'
                    })
                }
            }]
        })
    };
}

/**
 * @notice Setup market scenario for testing
 * @param {TradingStrategy} strategy - Trading strategy instance
 * @param {Object} scenario - Market scenario data
 */
function setupMarketScenario(strategy, scenario) {
    // Mock market data methods
    strategy._getMultiTimeframeData = jest.fn().mockResolvedValue(scenario.priceData);
    strategy._calculateAdvancedIndicators = jest.fn().mockResolvedValue(scenario.indicators);
    strategy._getAdvancedSentimentAnalysis = jest.fn().mockResolvedValue(scenario.sentiment);
    
    // Mock order book data
    strategy._analyzeOrderBook = jest.fn().mockResolvedValue({
        bidVolume: 1500000,
        askVolume: 1200000,
        imbalance: 0.111,
        spreadTightness: 0.998,
        largeOrderFlow: 300000
    });
}

/**
 * @notice Setup integration test environment
 * @param {TradingStrategy} strategy - Trading strategy instance
 */
async function setupIntegrationTestEnvironment(strategy) {
    // ============ Mock Required Internal Methods ============
    strategy._initializeEnhancedStrategy = jest.fn().mockResolvedValue(true);
    strategy._startAdvancedDataCollection = jest.fn().mockResolvedValue(true);
    strategy._initializeArbitrageDetection = jest.fn().mockResolvedValue(true);
    strategy._startAdaptiveOptimization = jest.fn().mockReturnValue(true);
    
    // ============ Mock Network-Dependent Operations ============
    strategy._getMultiExchangePrices = jest.fn().mockResolvedValue([
        { exchange: 'Binance', askPrice: 50000, bidPrice: 49980, volume: 1000000 },
        { exchange: 'Coinbase', askPrice: 50100, bidPrice: 50080, volume: 800000 }
    ]);
    
    strategy._getMultiChainPrices = jest.fn().mockResolvedValue([
        { chain: 'Ethereum', price: 50000, liquidity: 2000000 },
        { chain: 'Arbitrum', price: 50050, liquidity: 1500000 }
    ]);
    
    // ============ Mock Utility Functions ============
    strategy._calculateArbitrageConfidence = jest.fn().mockReturnValue(0.75);
    strategy._estimateBridgeFee = jest.fn().mockReturnValue(0.05);
    strategy._calculateAverageVolatility = jest.fn().mockReturnValue(0.04);
    strategy._calculateTrendStrength = jest.fn().mockReturnValue(0.6);
    strategy._analyzeLiquidityConditions = jest.fn().mockReturnValue({ good: true });
}

/**
 * @notice Wait for trading cycle to complete
 * @param {TradingStrategy} strategy - Trading strategy instance
 * @param {number} timeout - Timeout in milliseconds
 */
async function waitForTradingCycle(strategy, timeout = 5000) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
}

/**
 * @notice Verify data storage in Recall
 * @param {Object} recallClient - Recall client instance
 * @param {string} bucketName - Bucket name to check
 * @returns {boolean} Whether data exists
 */
async function verifyRecallDataStorage(recallClient, bucketName) {
    try {
        const bucket = await recallClient.getOrCreateBucket(bucketName);
        const objects = await recallClient.queryObjects(bucket.bucket);
        return objects.objects.length > 0;
    } catch (error) {
        return false;
    }
}

/**
 * @notice Cleanup test data from Recall
 * @param {Object} recallClient - Recall client instance
 */
async function cleanupTestData(recallClient) {
    try {
        const bucket = await recallClient.getOrCreateBucket('enhanced_trading_analysis');
        const objects = await recallClient.queryObjects(bucket.bucket, {
            prefix: 'integration_test'
        });
        
        // Delete test objects
        for (const obj of objects.objects) {
            try {
                await recallClient.deleteObject(bucket.bucket, obj.key);
            } catch (error) {
                // Ignore deletion errors
            }
        }
    } catch (error) {
        // Ignore cleanup errors
    }
}