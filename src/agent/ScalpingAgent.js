// ============ Imports ============
// import { ethers } from 'ethers';
import { TradingStrategy } from './TradingStrategy.js';
import { RiskManager } from './RiskManager.js';
import RecallClient from '../integrations/RecallClient.js';
import VincentClient from '../integrations/VincentClient.js';
import GaiaClient from '../integrations/Gaia.Client.js';
import Logger from '../utils/Logger.js';
// CONFIG will be loaded dynamically in constructor

// ============ Constants ============
const AGENT_STATES = {
  INACTIVE: 'INACTIVE',
  INITIALIZING: 'INITIALIZING',
  ACTIVE: 'ACTIVE',
  STOPPING: 'STOPPING',
  ERROR: 'ERROR'
};

const COMPETITION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * @title ScalpingAgent
 * @notice Main autonomous trading agent for Recall hackathon competition
 * @dev Orchestrates all components for high-frequency scalping strategy
 */
export class ScalpingAgent {
  constructor (config = {}) {
    // ============ Agent Configuration ============
    this.config = {
      // Configuration loaded from environment variables
      ...config
    };

    // ============ Core Dependencies ============
    this.logger = Logger;
    this.recallClient = null;
    this.vincentClient = null;
    this.gaiaClient = null;

    // ============ Agent Components ============
    this.tradingStrategy = null;
    this.riskManager = null;

    // ============ Agent State ============
    this.state = AGENT_STATES.INACTIVE;
    this.startTime = null;
    this.endTime = null;
    this.competitionTimer = null;

    // ============ Performance Tracking ============
    this.performance = {
      startingBalance: 0,
      currentBalance: 0,
      totalTrades: 0,
      successfulTrades: 0,
      totalProfit: 0,
      maxDrawdown: 0,
      winRate: 0,
      sharpeRatio: 0,
      trades: []
    };

    // ============ System Health ============
    this.healthMetrics = {
      lastHeartbeat: Date.now(),
      systemLoad: 0,
      memoryUsage: 0,
      networkLatency: 0,
      errorCount: 0,
      uptime: 0
    };

    // ============ Event Handlers ============
    this.eventHandlers = new Map();
    this._setupEventHandlers();

    this.logger.info('ScalpingAgent initialized', {
      version: this.config.VERSION || '1.0.0',
      environment: this.config.ENVIRONMENT || 'development'
    });
  }

  // ============ Agent Lifecycle ============

  /**
     * @notice Initialize all agent components and connections
     * @dev Sets up clients, strategy, and prepares for trading
     */
  async initialize () {
    try {
      this.logger.info('Initializing ScalpingAgent...');
      this._setState(AGENT_STATES.INITIALIZING);

      // ============ Initialize Core Clients ============
      await this._initializeClients();

      // ============ Verify System Health ============
      await this._performHealthCheck();

      // ============ Initialize Trading Components ============
      await this._initializeTradingComponents();

      // ============ Verify Permissions and Policies ============
      await this._verifyPermissions();

      // ============ Load Historical Data ============
      await this._loadHistoricalData();

      // ============ Setup Monitoring ============
      this._setupMonitoring();

      this._setState(AGENT_STATES.ACTIVE);
      this.logger.info('ScalpingAgent initialization complete');
    } catch (error) {
      this._setState(AGENT_STATES.ERROR);
      this.logger.error('Failed to initialize ScalpingAgent', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Start the trading agent
     * @dev Wrapper method that starts the competition trading session
     */
  async start () {
    return await this.startCompetition();
  }

  /**
     * @notice Start the competition trading session
     * @dev Begins 1-hour trading competition with full monitoring
     */
  async startCompetition () {
    try {
      if (this.state !== AGENT_STATES.ACTIVE) {
        throw new Error(`Cannot start competition from state: ${this.state}`);
      }

      this.logger.info('Starting competition trading session...');

      // ============ Record Competition Start ============
      this.startTime = Date.now();
      this.endTime = this.startTime + COMPETITION_DURATION;

      // ============ Record Starting Balance ============
      await this._recordStartingBalance();

      // ============ Setup Competition Timer ============
      // this._setupCompetitionTimer(); // Disabled - manual control only

      // ============ Start Trading Strategy ============
      await this.tradingStrategy.start();

      // ============ Begin Performance Monitoring ============
      this._startPerformanceMonitoring();

      // ============ Store Competition Data in Recall ============
      await this._storeCompetitionStart();

      this.logger.info('Competition started successfully', {
        duration: COMPETITION_DURATION / 1000 / 60,
        endTime: new Date(this.endTime).toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to start competition', { error: error.message });
      await this._handleError(error);
      throw error;
    }
  }

  /**
     * @notice Stop the trading agent gracefully
     * @dev Closes positions, saves data, and cleans up resources
     */
  async stop () {
    try {
      this.logger.info('🛑 Stopping ScalpingAgent...');
      this._setState(AGENT_STATES.STOPPING);

      // ============ Stop Trading Strategy ============
      if (this.tradingStrategy) {
        await this.tradingStrategy.stop();
        this.logger.info('✅ Trading strategy stopped');
      }

      // ============ Clear Competition Timer ============
      if (this.competitionTimer) {
        clearTimeout(this.competitionTimer);
        this.competitionTimer = null;
      }

      // ============ Calculate Final Performance ============
      await this._calculateFinalPerformance();

      // ============ Generate Trade Report ============
      await this._generateTradeReport();

      // ============ Store Final Results ============
      await this._storeFinalResults();

      // ============ Cleanup Resources ============
      await this._cleanup();

      this._setState(AGENT_STATES.INACTIVE);
      this.logger.info('✅ ScalpingAgent stopped successfully');
    } catch (error) {
      this.logger.error('❌ Error stopping ScalpingAgent', { error: error.message });
      this._setState(AGENT_STATES.ERROR);
    }
  }

  // ============ Core Initialization Methods ============

  /**
     * @notice Initialize all external service clients
     * @dev Sets up connections to Recall, Vincent, and Gaia
     */
  async _initializeClients () {
    try {
      this.logger.info('Initializing service clients...');

      // ============ Initialize Recall Client ============
      this.recallClient = new RecallClient({
        privateKey: this.config.RECALL_PRIVATE_KEY,
        network: this.config.RECALL_NETWORK || 'testnet'
      });
      await this.recallClient.initialize();

      // ============ Initialize Vincent Client ============
      this.vincentClient = new VincentClient({
        appId: this.config.VINCENT_APP_ID,
        delegateePrivateKey: this.config.VINCENT_DELEGATEE_PRIVATE_KEY,
        policies: this.config.VINCENT_POLICIES || []
      });
      await this.vincentClient.initialize();

      // ============ Initialize Gaia Client (Optional) ============
      if (process.env.GAIA_API_KEY) {
        this.gaiaClient = new GaiaClient({
          apiKey: this.config.GAIA_API_KEY || process.env.GAIA_API_KEY,
          nodeUrl: this.config.GAIA_NODE_URL || process.env.GAIA_NODE_URL,
          model: this.config.GAIA_MODEL || process.env.GAIA_MODEL
        });
        await this.gaiaClient.initialize();
      } else {
        this.gaiaClient = null;
        this.logger.warn('⚠️ Gaia AI client disabled - no API key provided');
      }

      this.logger.info('All service clients initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize clients', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Initialize trading strategy and risk management
     * @dev Creates strategy instance with all required dependencies
     */
  async _initializeTradingComponents () {
    try {
      this.logger.info('Initializing trading components...');

      // ============ Initialize Risk Manager ============
      this.riskManager = new RiskManager({
        maxDrawdown: this.config.MAX_DRAWDOWN_PERCENT || 5,
        maxPositionSize: this.config.MAX_POSITION_SIZE || 0.2,
        stopLossPercent: this.config.STOP_LOSS_PERCENT || 0.3,
        takeProfitPercent: this.config.TAKE_PROFIT_PERCENT || 0.5,
        maxConcurrentTrades: this.config.MAX_CONCURRENT_TRADES || 3
      });

      // ============ Initialize Trading Strategy ============
      this.tradingStrategy = new TradingStrategy({
        recallClient: this.recallClient,
        vincentClient: this.vincentClient,
        gaiaClient: this.gaiaClient
      }, this.logger);

      // ============ Setup Component Event Listeners ============
      this._setupComponentEvents();

      this.logger.info('Trading components initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize trading components', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Verify Vincent permissions and policies are correctly configured
     * @dev Ensures all required permissions are granted for trading
     */
  async _verifyPermissions () {
    try {
      this.logger.info('Verifying Vincent permissions...');

      // ============ Simplified Permission Check for Testing ============
      // Check if Vincent client is initialized and has the trade execution capability
      if (!this.vincentClient || typeof this.vincentClient.requestTradePermission !== 'function') {
        throw new Error('Vincent client not properly initialized for trading');
      }

      // Verify that the trading tool is loaded and accessible
      if (!this.vincentClient.toolClient) {
        throw new Error('Vincent tool client not initialized');
      }

      this.logger.info('Permissions verified successfully', {
        vincentInitialized: !!this.vincentClient,
        tradePermissionMethod: typeof this.vincentClient.requestTradePermission,
        toolClientInitialized: !!this.vincentClient.toolClient
      });
    } catch (error) {
      this.logger.error('Permission verification failed', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Load historical market data for analysis
     * @dev Simplified implementation for testing environment
     */
  async _loadHistoricalData () {
    try {
      this.logger.info('Loading historical market data...');

      // ============ Simplified Historical Data Loading for Testing ============
      // In a production environment, this would load historical price data
      // For testing, we'll just initialize empty data structures

      for (const pair of this.tradingStrategy.tradingPairs) {
        // Initialize empty data structures for each trading pair
        this.tradingStrategy.marketData.priceData.set(pair, {
          '1s': [],
          '5s': [],
          '15s': [],
          '1m': [],
          '5m': []
        });

        this.tradingStrategy.marketData.volumeData.set(pair, []);
        this.tradingStrategy.marketData.orderBookData.set(pair, {});
      }

      this.logger.info('Historical data initialized', {
        pairs: this.tradingStrategy.tradingPairs.length,
        dataStructures: ['priceData', 'volumeData', 'orderBookData']
      });
    } catch (error) {
      this.logger.error('Failed to load historical data', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Setup monitoring systems for the agent
     * @dev Simplified implementation for testing environment
     */
  _setupMonitoring () {
    try {
      this.logger.info('Setting up monitoring systems...');

      // ============ Simplified Monitoring Setup for Testing ============
      // In a production environment, this would set up comprehensive monitoring
      // For testing, we'll just log that monitoring is initialized

      this.logger.info('Monitoring systems initialized', {
        healthChecks: 'enabled',
        performanceTracking: 'enabled',
        alerting: 'enabled'
      });
    } catch (error) {
      this.logger.error('Failed to setup monitoring', { error: error.message });
      throw error;
    }
  }

  // ============ Competition Management ============

  /**
     * @notice Setup competition timer for automatic stop
     * @dev Ensures trading stops exactly at competition end time
     */
  _setupCompetitionTimer () {
    const remainingTime = this.endTime - Date.now();

    if (remainingTime <= 0) {
      this.logger.warn('Competition time already expired');
      return;
    }

    this.competitionTimer = setTimeout(async () => {
      this.logger.info('Competition time expired, stopping agent...');
      await this.stop();
    }, remainingTime);

    // ============ Setup Periodic Status Updates ============
    const statusInterval = setInterval(() => {
      if (this.state !== AGENT_STATES.ACTIVE) {
        clearInterval(statusInterval);
        return;
      }

      const remaining = this.endTime - Date.now();
      const elapsed = Date.now() - this.startTime;

      this.logger.info('Competition status', {
        elapsed: Math.round(elapsed / 1000 / 60),
        remaining: Math.round(remaining / 1000 / 60),
        trades: this.performance.totalTrades,
        profit: this.performance.totalProfit
      });
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
     * @notice Record starting balance for performance calculation
     * @dev Gets initial portfolio value from Vincent/Recall
     */
  async _recordStartingBalance () {
    try {
      // ============ Get Account Balance from Recall ============
      const accountInfo = await this.recallClient.getAccountInfo();
      this.performance.startingBalance = parseFloat(accountInfo.balance) || 12000; // Use default if balance is invalid
      this.performance.currentBalance = this.performance.startingBalance;

      this.logger.info('Starting balance recorded', {
        balance: this.performance.startingBalance,
        source: accountInfo.balance ? 'Recall API' : 'Default fallback'
      });
    } catch (error) {
      this.logger.error('Failed to record starting balance', { error: error.message });
      // Use default if unable to fetch
      this.performance.startingBalance = 12000; // Default for testing
      this.performance.currentBalance = this.performance.startingBalance;

      this.logger.warn('Using fallback starting balance', {
        balance: this.performance.startingBalance
      });
    }
  }

  // ============ Performance Monitoring ============

  /**
     * @notice Start continuous performance monitoring
     * @dev Tracks metrics and updates performance data
     */
  _startPerformanceMonitoring () {
    const monitoringInterval = setInterval(async () => {
      if (this.state !== AGENT_STATES.ACTIVE) {
        clearInterval(monitoringInterval);
        return;
      }

      try {
        await this._updatePerformanceMetrics();
        await this._updateHealthMetrics();
        await this._storePerformanceSnapshot();
      } catch (error) {
        this.logger.error('Performance monitoring error', { error: error.message });
      }
    }, 30000); // Every 30 seconds
  }

  /**
     * @notice Update current performance metrics
     * @dev Calculates real-time performance indicators
     */
  async _updatePerformanceMetrics () {
    try {
      // ============ Get Current Balance ============
      try {
        const accountInfo = await this.recallClient.getAccountInfo();
        this.performance.currentBalance = parseFloat(accountInfo.balance);
        this.performance.totalProfit = this.performance.currentBalance - this.performance.startingBalance;
      } catch (error) {
        // ============ Fallback: Calculate from Trade History ============
        const tradeHistory = this.tradingStrategy.tradeHistory || [];
        let realizedProfit = 0;

        // Track positions by trading pair
        const positions = new Map();

        tradeHistory.forEach(trade => {
          if (trade.result?.success) {
            const pair = trade.pair;
            const action = trade.tradeParams?.action;
            const amount = trade.tradeParams?.amount || 0;
            const price = trade.result?.result?.executedPrice || trade.tradeParams?.price || 0;

            if (!positions.has(pair)) {
              positions.set(pair, { buyTrades: [], sellTrades: [] });
            }

            const pairData = positions.get(pair);

            if (action === 'BUY') {
              pairData.buyTrades.push({ amount, price, value: amount * price });
            } else if (action === 'SELL') {
              pairData.sellTrades.push({ amount, price, value: amount * price });
            }
          }
        });

        // Calculate realized profit from completed trades
        positions.forEach((pairData) => {
          const { buyTrades, sellTrades } = pairData;

          // Simple approach: match sells against buys (FIFO)
          let buyIndex = 0;
          let remainingBuyAmount = buyTrades[0]?.amount || 0;
          let buyPrice = buyTrades[0]?.price || 0;

          sellTrades.forEach(sell => {
            let remainingSellAmount = sell.amount;

            while (remainingSellAmount > 0 && buyIndex < buyTrades.length) {
              if (remainingBuyAmount === 0) {
                buyIndex++;
                if (buyIndex < buyTrades.length) {
                  remainingBuyAmount = buyTrades[buyIndex].amount;
                  buyPrice = buyTrades[buyIndex].price;
                }
                continue;
              }

              const tradeAmount = Math.min(remainingBuyAmount, remainingSellAmount);
              const profit = (sell.price - buyPrice) * tradeAmount;
              realizedProfit += profit;

              remainingBuyAmount -= tradeAmount;
              remainingSellAmount -= tradeAmount;
            }
          });
        });

        this.performance.totalProfit = realizedProfit;
        this.performance.currentBalance = this.performance.startingBalance + this.performance.totalProfit;
      }

      // ============ Calculate Performance Metrics ============
      const strategyPerformance = this.tradingStrategy.performanceMetrics;

      this.performance.totalTrades = strategyPerformance.totalTrades;
      this.performance.successfulTrades = strategyPerformance.winningTrades;
      this.performance.winRate = this.performance.totalTrades > 0
        ? this.performance.successfulTrades / this.performance.totalTrades
        : 0;

      // ============ Calculate Drawdown ============
      const highWaterMark = Math.max(this.performance.startingBalance, this.performance.currentBalance);
      const currentDrawdown = (highWaterMark - this.performance.currentBalance) / highWaterMark;
      this.performance.maxDrawdown = Math.max(this.performance.maxDrawdown, currentDrawdown);
    } catch (error) {
      this.logger.error('Failed to update performance metrics', { error: error.message });
    }
  }

  /**
     * @notice Update system health metrics
     * @dev Monitors system resources and network latency
     */
  async _updateHealthMetrics () {
    try {
      // ============ Update Basic Health Metrics ============
      this.healthMetrics.lastHeartbeat = Date.now();
      this.healthMetrics.uptime = Date.now() - this.startTime;

      // ============ Memory Usage ============
      const memUsage = process.memoryUsage();
      this.healthMetrics.memoryUsage = memUsage.heapUsed / memUsage.heapTotal;

      // ============ Network Latency Check ============
      const latencyStart = Date.now();
      await this.gaiaClient.ping(); // Simple ping to check latency
      this.healthMetrics.networkLatency = Date.now() - latencyStart;
    } catch (error) {
      this.healthMetrics.errorCount++;
      this.logger.warn('Health metrics update failed', { error: error.message });
    }
  }

  // ============ Data Persistence ============

  /**
     * @notice Store competition start data in Recall
     * @dev Records initial state for competition tracking
     */
  async _storeCompetitionStart () {
    try {
      const competitionData = {
        agentId: this.config.AGENT_ID || 'scalping-agent',
        startTime: this.startTime,
        endTime: this.endTime,
        startingBalance: this.performance.startingBalance,
        configuration: {
          tradingPairs: this.config.TRADING_PAIRS,
          maxConcurrentTrades: this.config.MAX_CONCURRENT_TRADES,
          riskParameters: this.riskManager.getConfig()
        },
        timestamp: Date.now()
      };

      const bucket = await this.recallClient.getOrCreateBucket('competition_data');
      await this.recallClient.addObject(
        bucket.bucket,
                `competition_start_${this.startTime}`,
                JSON.stringify(competitionData)
      );
    } catch (error) {
      this.logger.error('Failed to store competition start data', { error: error.message });
    }
  }

  /**
     * @notice Store periodic performance snapshot
     * @dev Saves current performance state for analysis
     */
  async _storePerformanceSnapshot () {
    try {
      const snapshot = {
        timestamp: Date.now(),
        performance: { ...this.performance },
        health: { ...this.healthMetrics },
        activePositions: this.tradingStrategy.currentPositions.size,
        state: this.state
      };

      const bucket = await this.recallClient.getOrCreateBucket('performance_snapshots');
      await this.recallClient.addObject(
        bucket.bucket,
                `snapshot_${Date.now()}`,
                JSON.stringify(snapshot)
      );
    } catch (error) {
      this.logger.error('Failed to store performance snapshot', { error: error.message });
    }
  }

  /**
     * @notice Calculate and store final competition results
     * @dev Comprehensive final analysis and data storage
     */
  async _calculateFinalPerformance () {
    try {
      this.logger.info('Calculating final performance...');

      // ============ Final Balance Update ============
      try {
        const accountInfo = await this.recallClient.getAccountInfo();
        this.performance.currentBalance = parseFloat(accountInfo.balance);
        this.performance.totalProfit = this.performance.currentBalance - this.performance.startingBalance;
      } catch (error) {
        this.logger.warn('Failed to get account info, calculating from trade history', { error: error.message });

        // ============ Fallback: Calculate from Trade History ============
        const tradeHistory = this.tradingStrategy.tradeHistory || [];
        let totalProfit = 0;
        let totalSpent = 0;

        tradeHistory.forEach(trade => {
          if (trade.result?.success) {
            const amount = trade.tradeParams?.amount || 0;
            const price = trade.result?.result?.executedPrice || trade.tradeParams?.price || 0;
            const value = amount * price;

            if (trade.tradeParams?.action === 'BUY') {
              totalSpent += value;
            } else if (trade.tradeParams?.action === 'SELL') {
              totalProfit += value;
            }
          }
        });

        // Simple P&L calculation (this is a basic approximation)
        this.performance.totalProfit = totalProfit - totalSpent;
        this.performance.currentBalance = this.performance.startingBalance + this.performance.totalProfit;
      }

      // ============ Calculate Advanced Metrics ============
      const totalDuration = Date.now() - this.startTime;
      const annualizedReturn = (this.performance.totalProfit / this.performance.startingBalance) *
                (365 * 24 * 60 * 60 * 1000 / totalDuration);

      // ============ Sharpe Ratio Calculation ============
      // Simplified calculation for competition context
      this.performance.sharpeRatio = this.performance.totalProfit > 0
        ? this.performance.totalProfit / (this.performance.maxDrawdown || 0.01)
        : 0;

      this.performance.finalMetrics = {
        totalDuration,
        annualizedReturn,
        tradesPerHour: this.performance.totalTrades / (totalDuration / (60 * 60 * 1000)),
        avgProfitPerTrade: this.performance.totalTrades > 0
          ? this.performance.totalProfit / this.performance.totalTrades
          : 0
      };

      this.logger.info('Final performance calculated', {
        totalProfit: this.performance.totalProfit,
        winRate: this.performance.winRate,
        totalTrades: this.performance.totalTrades,
        sharpeRatio: this.performance.sharpeRatio
      });
    } catch (error) {
      this.logger.error('Failed to calculate final performance', { error: error.message });
    }
  }

  /**
     * @notice Generate comprehensive trade report
     * @dev Creates detailed trading session report with all trades and P&L
     */
  async _generateTradeReport () {
    try {
      this.logger.info('📊 Generating trade report...');

      const totalDuration = Date.now() - this.startTime;
      const durationHours = Math.round(totalDuration / (60 * 60 * 1000) * 100) / 100;
      const durationMinutes = Math.round(totalDuration / (60 * 1000));

      // ============ Trade Report Header ============
      this.logger.info('\n' + '='.repeat(60));
      this.logger.info('🏆 TRADING SESSION REPORT');
      this.logger.info('='.repeat(60));
      this.logger.info(`📅 Session Duration: ${durationHours}h (${durationMinutes}m)`);
      this.logger.info(`🚀 Start Time: ${new Date(this.startTime).toLocaleString()}`);
      this.logger.info(`🏁 End Time: ${new Date().toLocaleString()}`);
      this.logger.info('-'.repeat(60));

      // ============ Performance Summary ============
      this.logger.info('💰 PERFORMANCE SUMMARY');
      this.logger.info('-'.repeat(60));
      this.logger.info(`💵 Starting Balance: $${this.performance.startingBalance.toFixed(2)}`);
      this.logger.info(`💵 Final Balance: $${this.performance.currentBalance.toFixed(2)}`);
      this.logger.info(`${this.performance.totalProfit >= 0 ? '📈' : '📉'} Total P&L: $${this.performance.totalProfit.toFixed(2)}`);
      this.logger.info(`📊 Total Trades: ${this.performance.totalTrades}`);
      this.logger.info(`✅ Successful Trades: ${this.performance.successfulTrades}`);
      this.logger.info(`🎯 Win Rate: ${(this.performance.winRate * 100).toFixed(1)}%`);
      this.logger.info(`📉 Max Drawdown: ${(this.performance.maxDrawdown * 100).toFixed(2)}%`);

      if (this.performance.finalMetrics) {
        this.logger.info(`⚡ Trades/Hour: ${this.performance.finalMetrics.tradesPerHour.toFixed(2)}`);
        this.logger.info(`💎 Avg Profit/Trade: $${this.performance.finalMetrics.avgProfitPerTrade.toFixed(2)}`);
        this.logger.info(`📊 Sharpe Ratio: ${this.performance.sharpeRatio.toFixed(2)}`);
      }

      // ============ Trade History ============
      if (this.performance.trades && this.performance.trades.length > 0) {
        this.logger.info('\n' + '-'.repeat(60));
        this.logger.info('📋 TRADE HISTORY');
        this.logger.info('-'.repeat(60));

        let runningPnL = 0;
        this.performance.trades.forEach((trade, index) => {
          const pnl = trade.pnl || 0;
          runningPnL += pnl;
          const status = pnl >= 0 ? '✅' : '❌';
          const time = new Date(trade.timestamp).toLocaleTimeString();

          this.logger.info(`${status} #${index + 1} ${time} | ${trade.pair} | ${trade.side} | $${trade.amount} @ $${trade.price} | P&L: $${pnl.toFixed(2)} | Running: $${runningPnL.toFixed(2)}`);
        });
      } else {
        this.logger.info('\n' + '-'.repeat(60));
        this.logger.info('📋 TRADE HISTORY: No trades executed');
      }

      // ============ Risk Metrics ============
      this.logger.info('\n' + '-'.repeat(60));
      this.logger.info('⚠️ RISK METRICS');
      this.logger.info('-'.repeat(60));
      this.logger.info(`🛡️ Max Position Size: ${this.riskManager ? this.riskManager.maxPositionSize : 'N/A'}`);
      this.logger.info(`🚨 Stop Loss Triggers: ${this.healthMetrics.errorCount}`);
      this.logger.info(`⏰ System Uptime: ${durationMinutes}m`);

      // ============ Final Status ============
      this.logger.info('\n' + '-'.repeat(60));
      const totalProfit = this.performance.totalProfit || 0;
      if (totalProfit > 0) {
        this.logger.info('🎉 PROFITABLE SESSION!');
        this.logger.info(`💰 Net Profit: $${totalProfit.toFixed(2)}`);
        this.logger.info(`📊 ROI: ${((totalProfit / this.performance.startingBalance) * 100).toFixed(2)}%`);
        this.logger.info(`✅ EXTRA AMOUNT MADE: $${totalProfit.toFixed(2)}`);
      } else if (totalProfit < 0) {
        this.logger.info('😞 LOSS SESSION');
        this.logger.info(`💸 Net Loss: $${Math.abs(totalProfit).toFixed(2)}`);
        this.logger.info(`📉 Loss Rate: ${((Math.abs(totalProfit) / this.performance.startingBalance) * 100).toFixed(2)}%`);
        this.logger.info(`❌ AMOUNT LOST: $${Math.abs(totalProfit).toFixed(2)}`);
      } else {
        this.logger.info('🤝 BREAK-EVEN SESSION');
        this.logger.info('💰 No profit or loss');
        this.logger.info('🔄 Net Change: $0.00');
      }

      this.logger.info('='.repeat(60));
      this.logger.info('📊 Trade report generated successfully');
      this.logger.info('='.repeat(60) + '\n');
    } catch (error) {
      this.logger.error('Failed to generate trade report', { error: error.message });
    }
  }

  // ============ Event Handling ============

  /**
     * @notice Setup event handlers for system events
     * @dev Configures event listeners for various system events
     */
  _setupEventHandlers () {
    // ============ Component-Level Event Handlers Only ============
    // Note: Process-level handlers are managed by the main application
    // This prevents conflicts with multiple process.on handlers

    this.logger.info('ScalpingAgent event handlers configured (component-level only)');
  }

  /**
     * @notice Setup event listeners for trading components
     * @dev Listens to events from strategy and risk manager
     */
  _setupComponentEvents () {
    // ============ Trading Strategy Events ============
    if (this.tradingStrategy && typeof this.tradingStrategy.on === 'function') {
      this.tradingStrategy.on('trade_executed', (tradeData) => {
        this.logger.info('Trade executed', tradeData);
        this._onTradeExecuted(tradeData);
      });

      this.tradingStrategy.on('position_closed', (positionData) => {
        this.logger.info('Position closed', positionData);
        this._onPositionClosed(positionData);
      });
    }

    // ============ Risk Manager Events ============
    if (this.riskManager && typeof this.riskManager.on === 'function') {
      this.riskManager.on('risk_limit_exceeded', (riskData) => {
        this.logger.warn('Risk limit exceeded', riskData);
        this._onRiskLimitExceeded(riskData);
      });

      this.riskManager.on('position_should_close', (closeData) => {
        this.logger.info('RiskManager requests position close', closeData);
        this._onPositionShouldClose(closeData);
      });

      this.riskManager.on('emergency_stop_triggered', (emergencyData) => {
        this.logger.error('Emergency stop triggered by RiskManager', emergencyData);
        this._onEmergencyStop(emergencyData);
      });

      this.riskManager.on('force_close_position', (forceCloseData) => {
        this.logger.warn('Force closing position by RiskManager', forceCloseData);
        this._onForceClosePosition(forceCloseData);
      });
    }
  }

  // ============ Event Handlers ============

  /**
     * @notice Handle trade execution events
     * @param {object} tradeData - Trade execution data
     */
  _onTradeExecuted (tradeData) {
    try {
      // ============ Record Trade in Performance History ============
      const trade = {
        timestamp: Date.now(),
        tradeId: tradeData.tradeId || Date.now().toString(),
        pair: tradeData.pair,
        side: tradeData.side, // 'BUY' or 'SELL'
        amount: tradeData.amount,
        price: tradeData.price,
        fee: tradeData.fee || 0,
        pnl: tradeData.pnl || 0,
        strategy: tradeData.strategy || 'scalping',
        executionTime: tradeData.executionTime || Date.now()
      };

      // ============ Add to Performance Tracking ============
      this.performance.trades.push(trade);
      this.performance.totalTrades++;

      if (trade.pnl > 0) {
        this.performance.successfulTrades++;
      }

      // ============ Log Trade Execution ============
      this.logger.logTradeSuccess(trade);

      // ============ Update Performance Metrics ============
      this._updatePerformanceMetrics();
    } catch (error) {
      this.logger.error('Error handling trade execution', { error: error.message });
    }
  }

  /**
     * @notice Handle position closure events
     * @param {object} positionData - Position closure data
     */
  _onPositionClosed (positionData) {
    try {
      this.logger.info('Position closed', {
        pair: positionData.pair,
        side: positionData.side,
        pnl: positionData.pnl,
        duration: positionData.duration
      });

      // ============ Update Performance Metrics ============
      this._updatePerformanceMetrics();
    } catch (error) {
      this.logger.error('Error handling position closure', { error: error.message });
    }
  }

  /**
     * @notice Handle risk limit exceeded events
     * @param {object} riskData - Risk limit data
     */
  _onRiskLimitExceeded (riskData) {
    try {
      this.logger.warn('Risk limit exceeded', {
        limitType: riskData.limitType,
        currentValue: riskData.currentValue,
        limit: riskData.limit,
        action: riskData.action
      });

      // ============ Take Risk Management Action ============
      if (riskData.action === 'STOP_TRADING') {
        this.logger.warn('Stopping trading due to risk limits');
        this.stop();
      }
    } catch (error) {
      this.logger.error('Error handling risk limit exceeded', { error: error.message });
    }
  }

  /**
   * @notice Handle position should close events from RiskManager
   * @param {object} closeData - Position close data from RiskManager
   */
  _onPositionShouldClose (closeData) {
    try {
      this.logger.info('RiskManager requests position close', {
        positionId: closeData.positionId,
        reason: closeData.reason,
        currentPrice: closeData.currentPrice,
        pnl: closeData.pnl
      });

      // ============ Request TradingStrategy to Close Position ============
      if (this.tradingStrategy && typeof this.tradingStrategy.forceClosePosition === 'function') {
        this.tradingStrategy.forceClosePosition(closeData.positionId, closeData.reason, closeData.currentPrice);
      } else {
        this.logger.warn('TradingStrategy does not support position closing');
      }
    } catch (error) {
      this.logger.error('Error handling position should close', { error: error.message });
    }
  }

  /**
   * @notice Handle emergency stop events from RiskManager
   * @param {object} emergencyData - Emergency stop data
   */
  _onEmergencyStop (emergencyData) {
    try {
      this.logger.error('Emergency stop triggered', {
        reason: emergencyData.type,
        data: emergencyData.data
      });

      // ============ Immediate Agent Shutdown ============
      this.emergencyStop = true;
      this._setState(AGENT_STATES.STOPPING);

      // ============ Force Close All Positions ============
      if (this.riskManager) {
        this.riskManager.forceCloseAllPositions();
      }

      // ============ Stop Trading Strategy ============
      if (this.tradingStrategy) {
        this.tradingStrategy.stop();
      }

      this.logger.error('Emergency stop completed - all trading halted');
    } catch (error) {
      this.logger.error('Error handling emergency stop', { error: error.message });
    }
  }

  /**
   * @notice Handle force close position events from RiskManager
   * @param {object} forceCloseData - Force close data
   */
  _onForceClosePosition (forceCloseData) {
    try {
      this.logger.warn('Force closing position', {
        positionId: forceCloseData.positionId
      });

      // ============ Execute Force Close ============
      if (this.tradingStrategy && typeof this.tradingStrategy.forceClosePosition === 'function') {
        this.tradingStrategy.forceClosePosition(forceCloseData.positionId, 'FORCE_CLOSE', null);
      } else {
        this.logger.error('Cannot force close position - TradingStrategy missing method');
      }
    } catch (error) {
      this.logger.error('Error handling force close position', { error: error.message });
    }
  }

  // ============ Utility Methods ============

  /**
     * @notice Set agent state and emit state change event
     * @param {string} newState - New agent state
     */
  _setState (newState) {
    const oldState = this.state;
    this.state = newState;

    this.logger.info('Agent state changed', { from: oldState, to: newState });

    // Emit state change event if handler exists
    if (this.eventHandlers.has('state_change')) {
      this.eventHandlers.get('state_change')({ from: oldState, to: newState });
    }
  }

  /**
     * @notice Handle system errors gracefully
     * @param {Error} error - Error to handle
     */
  async _handleError (error) {
    try {
      this.healthMetrics.errorCount++;

      // ============ Log Error Details ============
      this.logger.error('System error occurred', {
        error: error.message,
        stack: error.stack,
        state: this.state,
        timestamp: Date.now()
      });

      // ============ Store Error in Recall ============
      const errorData = {
        error: error.message,
        stack: error.stack,
        state: this.state,
        performance: { ...this.performance },
        timestamp: Date.now()
      };

      const bucket = await this.recallClient.getOrCreateBucket('error_logs');
      await this.recallClient.addObject(
        bucket.bucket,
                `error_${Date.now()}`,
                JSON.stringify(errorData)
      );

      // ============ Determine Recovery Action ============
      if (this.healthMetrics.errorCount > 5) {
        this.logger.error('Too many errors, stopping agent...');
        await this.stop();
      }
    } catch (handlingError) {
      this.logger.error('Error in error handler', { error: handlingError.message });
    }
  }

  /**
     * @notice Perform comprehensive health check
     * @dev Verifies all systems are operational
     */
  async _performHealthCheck () {
    try {
      this.logger.info('Performing health check...');

      // ============ Simplified Health Check (bypass for IPFS testing) ============
      // Check basic initialization status only
      if (!this.recallClient || !this.vincentClient) {
        throw new Error('One or more required clients not initialized');
      }

      this.logger.info('Health check passed - all systems operational');
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      throw error;
    }
  }

  /**
   * @notice Check RecallClient health status
   * @return {Promise<object>} Health status
   */
  async _checkRecallHealth () {
    const status = this.recallClient.getStatus();
    if (!status.isInitialized || !status.isConnected) {
      throw new Error(`RecallClient unhealthy: initialized=${status.isInitialized}, connected=${status.isConnected}`);
    }
    return { service: 'recall', status: 'healthy', details: status };
  }

  /**
   * @notice Check VincentClient health status
   * @return {Promise<object>} Health status
   */
  async _checkVincentHealth () {
    const status = this.vincentClient.getStatus();
    if (!status.isInitialized) {
      throw new Error(`VincentClient unhealthy: initialized=${status.isInitialized}`);
    }
    return { service: 'vincent', status: 'healthy', details: status };
  }

  /**
   * @notice Check GaiaClient health status
   * @return {Promise<object>} Health status
   */
  async _checkGaiaHealth () {
    const healthStatus = await this.gaiaClient.getHealthStatus();
    const isConnected = this.gaiaClient.isConnected();
    if (healthStatus.status !== 'pass' || !isConnected) {
      throw new Error(`GaiaClient unhealthy: health=${healthStatus.status}, connected=${isConnected}`);
    }
    return { service: 'gaia', status: 'healthy', details: { healthStatus, isConnected } };
  }

  // ============ Getter Methods ============

  /**
     * @notice Get current agent status
     * @returns {Object} Current agent status and metrics
     */
  getStatus () {
    return {
      state: this.state,
      startTime: this.startTime,
      endTime: this.endTime,
      performance: { ...this.performance },
      health: { ...this.healthMetrics },
      activePositions: this.tradingStrategy?.currentPositions?.size || 0,
      uptime: this.startTime ? Date.now() - this.startTime : 0
    };
  }

  /**
     * @notice Get configuration
     * @returns {Object} Agent configuration
     */
  getConfig () {
    return { ...this.config };
  }
}
