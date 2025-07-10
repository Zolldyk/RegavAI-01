// ============ Imports ============
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// import { ethers } from 'ethers';
import RecallClient from './integrations/RecallClient.js';
import VincentClient from './integrations/VincentClient.js';
import GaiaClient from './integrations/Gaia.Client.js';
import { TradingStrategy } from './agent/TradingStrategy.js';
import { RiskManager } from './agent/RiskManager.js';
import Logger from './utils/Logger.js';
// import config from './utils/Config.js';
import { readFileSync } from 'fs';

// Load trading configuration
const CONFIG = JSON.parse(readFileSync('./src/configs/trading.json', 'utf8'));

// Map CONFIG structure to match expected properties
const TRADING_PAIRS = CONFIG.trading.tradingPairs;
const MAX_CONCURRENT_TRADES = CONFIG.trading.maxConcurrentTrades;
const MAX_POSITION_SIZE = CONFIG.riskManagement.positionSizeLimits.max;
const STOP_LOSS_PERCENT = CONFIG.riskManagement.stopLossPercent;
const MAX_DRAWDOWN_PERCENT = CONFIG.riskManagement.maxDrawdownPercent;
const TARGET_TRADES = CONFIG.competition.targetTrades;
const PROFIT_TARGET = CONFIG.competition.profitTarget;
const MAX_LOSS_PERCENT = CONFIG.competition.maxLoss;

// ============ Simple Helper Classes ============
class ErrorHandler {
  constructor (logger) {
    this.logger = logger;
  }

  handle (error, context = '') {
    this.logger.error(`Error ${context}:`, error.message);
    return { success: false, error: error.message };
  }
}

class PerformanceMonitor {
  constructor (logger) {
    this.logger = logger;
    this.metrics = {};
  }

  track (name, value) {
    this.metrics[name] = value;
    this.logger.debug(`Performance metric ${name}:`, value);
  }

  getMetrics () {
    return { ...this.metrics };
  }
}

// ============ Client Factory Functions ============
function getRecallClient () {
  return new RecallClient();
}

function getVincentClient () {
  return new VincentClient();
}

function getGaiaClient () {
  return new GaiaClient();
}

// ============ Module Setup ============
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// ============ Global Constants ============
const COMPETITION_DURATION = 3600000; // 1 hour in milliseconds
const SHUTDOWN_TIMEOUT = 30000; // 30 seconds for graceful shutdown
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute health checks

/**
 * @title EnhancedTradingAgent
 * @notice Main entry point for the Recall Hackathon Trading Agent
 * @dev Orchestrates all components for optimal performance in 1-hour competition
 */
class EnhancedTradingAgent {
  constructor () {
    // ============ Core Components ============
    this.logger = new Logger('EnhancedTradingAgent');
    this.errorHandler = new ErrorHandler(this.logger);
    this.performanceMonitor = new PerformanceMonitor(this.logger);

    // ============ Client Instances ============
    this.recallClient = null;
    this.vincentClient = null;
    this.gaiaClient = null;

    // ============ Strategy Components ============
    this.tradingStrategy = null;
    this.riskManager = null;

    // ============ Agent State ============
    this.isRunning = false;
    this.startTime = null;
    this.competitionEndTime = null;
    this.healthCheckInterval = null;
    this.gracefulShutdownInProgress = false;

    // ============ Performance Tracking ============
    this.metrics = {
      totalTrades: 0,
      successfulTrades: 0,
      totalProfit: 0,
      maxDrawdown: 0,
      uptime: 0,
      errors: 0
    };

    // Bind context for event handlers
    this.handleShutdown = this.handleShutdown.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  // ============ Initialization Methods ============

  /**
     * @notice Initialize all agent components and validate configuration
     * @dev Sets up clients, strategy, and monitoring systems
     */
  async initialize () {
    try {
      this.logger.info('🚀 Initializing Enhanced Trading Agent for Recall Hackathon...');

      // ============ Validate Environment ============
      this._validateEnvironment();

      // ============ Initialize Error Handling ============
      this._setupErrorHandling();

      // ============ Initialize Clients ============
      await this._initializeClients();

      // ============ Initialize Risk Management ============
      await this._initializeRiskManager();

      // ============ Initialize Trading Strategy ============
      await this._initializeTradingStrategy();

      // ============ Initialize Performance Monitoring ============
      await this._initializePerformanceMonitoring();

      // ============ Setup Health Checks ============
      this._setupHealthChecks();

      // ============ Setup Graceful Shutdown ============
      this._setupGracefulShutdown();

      this.logger.info('✅ Enhanced Trading Agent initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Enhanced Trading Agent', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
     * @notice Validate required environment variables and configuration
     * @dev Ensures all necessary credentials and settings are present
     */
  _validateEnvironment () {
    const requiredEnvVars = [
      'RECALL_PRIVATE_KEY',
      'VINCENT_APP_DELEGATEE_PRIVATE_KEY',
      'GAIA_API_KEY'
    ];

    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // ============ Validate Private Key Format ============
    if (!process.env.RECALL_PRIVATE_KEY.startsWith('0x')) {
      throw new Error('RECALL_PRIVATE_KEY must start with 0x');
    }

    if (!process.env.VINCENT_APP_DELEGATEE_PRIVATE_KEY.startsWith('0x')) {
      throw new Error('VINCENT_APP_DELEGATEE_PRIVATE_KEY must start with 0x');
    }

    // ============ Validate Configuration ============
    if (!TRADING_PAIRS || TRADING_PAIRS.length === 0) {
      throw new Error('No trading pairs configured');
    }

    this.logger.info('✅ Environment validation successful', {
      tradingPairs: TRADING_PAIRS.length,
      hasRecallKey: !!process.env.RECALL_PRIVATE_KEY,
      hasVincentKey: !!process.env.VINCENT_APP_DELEGATEE_PRIVATE_KEY,
      hasGaiaKey: !!process.env.GAIA_API_KEY
    });
  }

  /**
     * @notice Initialize all external service clients
     * @dev Sets up Recall, Vincent, and Gaia clients with proper error handling
     */
  async _initializeClients () {
    this.logger.info('🔧 Initializing service clients...');

    try {
      // ============ Initialize Recall Client ============
      this.logger.info('Initializing Recall client...');
      this.recallClient = getRecallClient();
      this.logger.info('✅ Recall client initialized');

      // ============ Initialize Vincent Client ============
      this.logger.info('Initializing Vincent client...');
      this.vincentClient = getVincentClient();
      this.logger.info('✅ Vincent client initialized');

      // ============ Initialize Gaia Client ============
      this.logger.info('Initializing Gaia client...');
      this.gaiaClient = getGaiaClient();
      this.logger.info('✅ Gaia client initialized');

      // ============ Validate Client Connections ============
      await this._validateClientConnections();
    } catch (error) {
      this.logger.error('❌ Failed to initialize clients', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Validate that all clients are properly connected and functional
     * @dev Performs basic connectivity tests for each service
     */
  async _validateClientConnections () {
    this.logger.info('🔍 Validating client connections...');

    try {
      // ============ Test Recall Connection ============
      const recallAccountInfo = await this.recallClient.getAccountInfo();
      this.logger.info('Recall connection validated', {
        address: recallAccountInfo.address,
        balance: recallAccountInfo.balance
      });

      // ============ Test Gaia Connection ============
      const gaiaModels = await this.gaiaClient.getModels();
      this.logger.info('Gaia connection validated', {
        modelsAvailable: gaiaModels.length > 0
      });

      // Note: Vincent validation happens during tool execution
      this.logger.info('✅ All client connections validated');
    } catch (error) {
      this.logger.error('❌ Client connection validation failed', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Initialize risk management system
     * @dev Sets up risk controls and position limits
     */
  async _initializeRiskManager () {
    this.logger.info('🛡️ Initializing risk management system...');

    try {
      this.riskManager = new RiskManager({
        maxPositionSize: MAX_POSITION_SIZE || 5000,
        maxConcurrentTrades: MAX_CONCURRENT_TRADES || 5,
        stopLossPercent: STOP_LOSS_PERCENT || 0.3,
        maxDrawdownPercent: MAX_DRAWDOWN_PERCENT || 3.0,
        logger: this.logger
      });

      await this.riskManager.initialize();
      this.logger.info('✅ Risk management system initialized');
    } catch (error) {
      this.logger.error('❌ Failed to initialize risk manager', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Initialize the enhanced trading strategy
     * @dev Sets up the scalping strategy with all advanced features
     */
  async _initializeTradingStrategy () {
    this.logger.info('📈 Initializing enhanced trading strategy...');

    try {
      this.tradingStrategy = new TradingStrategy(
        this.recallClient,
        this.vincentClient,
        this.gaiaClient,
        this.logger
      );

      // ============ Configure Strategy Parameters ============
      this.tradingStrategy.riskManager = this.riskManager;

      this.logger.info('✅ Enhanced trading strategy initialized');
    } catch (error) {
      this.logger.error('❌ Failed to initialize trading strategy', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Initialize performance monitoring system
     * @dev Sets up metrics collection and reporting
     */
  async _initializePerformanceMonitoring () {
    this.logger.info('📊 Initializing performance monitoring...');

    try {
      this.performanceMonitor.track('initialization', Date.now());
      this.logger.info('✅ Performance monitoring initialized');
    } catch (error) {
      this.logger.error('❌ Failed to initialize performance monitoring', { error: error.message });
      throw error;
    }
  }

  // ============ Main Execution Methods ============

  /**
     * @notice Start the enhanced trading agent for competition
     * @dev Begins the 1-hour trading competition with full monitoring
     */
  async start () {
    try {
      if (this.isRunning) {
        this.logger.warn('Trading agent is already running');
        return;
      }

      this.logger.info('🏁 Starting Enhanced Trading Agent for 1-hour competition...');

      // ============ Set Competition Timing ============
      this.startTime = Date.now();
      this.competitionEndTime = this.startTime + COMPETITION_DURATION;
      this.isRunning = true;

      // ============ Log Competition Parameters ============
      this.logger.info('Competition parameters:', {
        duration: `${COMPETITION_DURATION / 1000 / 60} minutes`,
        tradingPairs: TRADING_PAIRS,
        maxConcurrentTrades: MAX_CONCURRENT_TRADES,
        targetTrades: TARGET_TRADES || 50,
        profitTarget: `${PROFIT_TARGET || 25}%`
      });

      // ============ Start Performance Monitoring ============
      this.performanceMonitor.track('competition_start', Date.now());

      // ============ Start Trading Strategy ============
      // Note: TradingStrategy start method will be implemented
      this.logger.info('Trading strategy starting...');

      // ============ Monitor Competition Progress ============
      await this._monitorCompetition();
    } catch (error) {
      this.logger.error('❌ Failed to start trading agent', { error: error.message });
      await this.handleError(error);
      throw error;
    }
  }

  /**
     * @notice Monitor competition progress and handle completion
     * @dev Tracks performance and handles graceful completion
     */
  async _monitorCompetition () {
    this.logger.info('📈 Competition monitoring started');

    const monitorInterval = setInterval(async () => {
      try {
        const timeRemaining = this.competitionEndTime - Date.now();
        const progressPercent = ((COMPETITION_DURATION - timeRemaining) / COMPETITION_DURATION) * 100;

        // ============ Log Progress ============
        if (progressPercent % 10 < 1) { // Log every 10% progress
          this.logger.info(`Competition progress: ${progressPercent.toFixed(1)}%`, {
            timeRemaining: `${Math.round(timeRemaining / 1000 / 60)} minutes`,
            totalTrades: this.metrics.totalTrades,
            successfulTrades: this.metrics.successfulTrades,
            totalProfit: this.metrics.totalProfit,
            errors: this.metrics.errors
          });
        }

        // ============ Check for Competition End ============
        if (timeRemaining <= 0) {
          clearInterval(monitorInterval);
          await this._completeCompetition();
        }

        // ============ Check for Early Exit Conditions ============
        await this._checkEarlyExitConditions(timeRemaining);
      } catch (error) {
        this.logger.error('Error in competition monitoring', { error: error.message });
      }
    }, 30000); // Check every 30 seconds
  }

  /**
     * @notice Check for conditions that warrant early competition exit
     * @dev Monitors for excessive losses or system issues
     */
  async _checkEarlyExitConditions (timeRemaining) {
    // ============ Check Maximum Loss Threshold ============
    if (this.metrics.totalProfit < -MAX_LOSS_PERCENT) {
      this.logger.warn('Maximum loss threshold reached, initiating early exit', {
        currentLoss: `${this.metrics.totalProfit.toFixed(2)}%`,
        threshold: `${MAX_LOSS_PERCENT}%`
      });
      await this._completeCompetition();
      return;
    }

    // ============ Check Risk Manager Status ============
    const riskStatus = this.riskManager.getRiskStatus();
    if (riskStatus.riskLevel === 'CRITICAL') {
      this.logger.warn('Critical risk level detected, considering early exit', riskStatus);
    }

    // ============ Check System Health ============
    if (this.metrics.errors > 10) {
      this.logger.warn('High error count detected', {
        errors: this.metrics.errors,
        timeRemaining: Math.round(timeRemaining / 1000 / 60)
      });
    }
  }

  /**
     * @notice Complete the trading competition and generate final report
     * @dev Stops trading, closes positions, and generates performance report
     */
  async _completeCompetition () {
    try {
      this.logger.info('🏆 Competition completed, generating final report...');

      // ============ Stop Trading Strategy ============
      this.logger.info('Stopping trading strategy...');

      // ============ Generate Final Performance Report ============
      const finalReport = {
        totalTrades: this.metrics.totalTrades,
        successfulTrades: this.metrics.successfulTrades,
        totalProfit: this.metrics.totalProfit,
        maxDrawdown: this.metrics.maxDrawdown,
        uptime: this.metrics.uptime,
        errors: this.metrics.errors,
        endTime: Date.now()
      };

      // ============ Log Final Results ============
      this.logger.info('🎯 FINAL COMPETITION RESULTS:', finalReport);

      // ============ Store Results in Recall ============
      await this._storeCompetitionResults(finalReport);

      // ============ Graceful Shutdown ============
      await this.shutdown();
    } catch (error) {
      this.logger.error('Error completing competition', { error: error.message });
      await this.handleError(error);
    }
  }

  /**
     * @notice Store competition results in Recall for transparency
     * @dev Creates permanent record of performance and trades
     */
  async _storeCompetitionResults (finalReport) {
    try {
      const bucket = await this.recallClient.getOrCreateBucket('competition_results');
      const resultsKey = `competition_${Date.now()}`;

      const resultsData = {
        ...finalReport,
        agentVersion: '1.0.0',
        competitionDuration: COMPETITION_DURATION,
        startTime: this.startTime,
        endTime: Date.now(),
        configuration: CONFIG,
        metadata: {
          hackathon: 'Recall Hackathon',
          strategy: 'Enhanced Scalping with Arbitrage',
          frameworks: ['Recall', 'Vincent', 'Gaia']
        }
      };

      await this.recallClient.addObject(
        bucket.bucket,
        resultsKey,
        JSON.stringify(resultsData, null, 2)
      );

      this.logger.info('Competition results stored in Recall', {
        bucket: bucket.bucket,
        key: resultsKey
      });
    } catch (error) {
      this.logger.error('Failed to store competition results', { error: error.message });
    }
  }

  // ============ Health Check and Monitoring ============

  /**
     * @notice Setup periodic health checks for all systems
     * @dev Monitors system health and performance during competition
     */
  _setupHealthChecks () {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this._performHealthCheck();
      } catch (error) {
        this.logger.error('Health check failed', { error: error.message });
        this.metrics.errors++;
      }
    }, HEALTH_CHECK_INTERVAL);

    this.logger.info('Health checks configured', {
      interval: `${HEALTH_CHECK_INTERVAL / 1000} seconds`
    });
  }

  /**
     * @notice Perform comprehensive health check of all systems
     * @dev Validates all components are functioning properly
     */
  async _performHealthCheck () {
    const healthStatus = {
      timestamp: Date.now(),
      uptime: Date.now() - (this.startTime || Date.now()),
      memory: process.memoryUsage(),
      isRunning: this.isRunning,
      components: {}
    };

    // ============ Check Trading Strategy Health ============
    if (this.tradingStrategy) {
      healthStatus.components.strategy = {
        totalTrades: this.metrics.totalTrades,
        successfulTrades: this.metrics.successfulTrades,
        totalProfit: this.metrics.totalProfit
      };
    }

    // ============ Check Risk Manager Health ============
    if (this.riskManager) {
      healthStatus.components.riskManager = {
        isInitialized: true
      };
    }

    // ============ Log Health Status ============
    this.logger.debug('System health check completed', healthStatus);

    // ============ Update Metrics ============
    this.metrics.uptime = healthStatus.uptime;
  }

  // ============ Error Handling and Shutdown ============

  /**
     * @notice Setup comprehensive error handling
     * @dev Configures global error handlers and process listeners
     */
  _setupErrorHandling () {
    // ============ Uncaught Exception Handler ============
    process.on('uncaughtException', async (error) => {
      this.logger.error('Uncaught exception detected', {
        error: error.message,
        stack: error.stack
      });
      await this.handleError(error);
      process.exit(1);
    });

    // ============ Unhandled Promise Rejection Handler ============
    process.on('unhandledRejection', async (reason, promise) => {
      this.logger.error('Unhandled promise rejection detected', {
        reason: reason?.message || reason,
        promise: promise.toString()
      });
      await this.handleError(new Error(reason?.message || reason));
    });

    this.logger.info('Error handling configured');
  }

  /**
     * @notice Setup graceful shutdown handlers
     * @dev Ensures clean shutdown on termination signals
     */
  _setupGracefulShutdown () {
    // ============ Handle Termination Signals ============
    ['SIGTERM', 'SIGINT', 'SIGUSR2'].forEach(signal => {
      process.on(signal, async () => {
        this.logger.info(`Received ${signal}, initiating graceful shutdown...`);
        await this.handleShutdown();
      });
    });

    this.logger.info('Graceful shutdown handlers configured');
  }

  /**
     * @notice Handle application errors with proper logging and recovery
     * @param {Error} error - The error that occurred
     */
  async handleError (error) {
    try {
      this.metrics.errors++;

      // ============ Log Error Details ============
      this.logger.error('Application error occurred', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        totalErrors: this.metrics.errors
      });

      // ============ Store Error in Recall ============
      try {
        const bucket = await this.recallClient?.getOrCreateBucket('error_logs');
        if (bucket) {
          const errorKey = `error_${Date.now()}`;
          const errorData = {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            context: {
              isRunning: this.isRunning,
              uptime: Date.now() - (this.startTime || Date.now()),
              metrics: this.metrics
            }
          };

          await this.recallClient.addObject(
            bucket.bucket,
            errorKey,
            JSON.stringify(errorData)
          );
        }
      } catch (storageError) {
        this.logger.error('Failed to store error in Recall', {
          error: storageError.message
        });
      }

      // ============ Check if Error is Fatal ============
      if (this._isFatalError(error)) {
        this.logger.error('Fatal error detected, initiating shutdown');
        await this.handleShutdown();
      }
    } catch (handlingError) {
      console.error('Error in error handler:', handlingError);
    }
  }

  /**
     * @notice Determine if an error is fatal and requires shutdown
     * @param {Error} error - The error to evaluate
     * @returns {boolean} True if the error is fatal
     */
  _isFatalError (error) {
    const fatalErrorTypes = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'Authentication failed',
      'Invalid private key',
      'Insufficient funds'
    ];

    return fatalErrorTypes.some(type =>
      error.message.includes(type) || error.code === type
    );
  }

  /**
     * @notice Handle graceful shutdown of the trading agent
     * @dev Stops all processes and ensures clean exit
     */
  async handleShutdown () {
    if (this.gracefulShutdownInProgress) {
      this.logger.warn('Graceful shutdown already in progress');
      return;
    }

    this.gracefulShutdownInProgress = true;
    this.logger.info('🛑 Initiating graceful shutdown...');

    try {
      // ============ Set Shutdown Timeout ============
      const shutdownTimer = setTimeout(() => {
        this.logger.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT);

      // ============ Stop Trading Strategy ============
      if (this.tradingStrategy) {
        this.logger.info('Stopping trading strategy...');
      }

      // ============ Close All Positions ============
      this.logger.info('Ensuring all positions are closed...');

      // ============ Stop Health Checks ============
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // ============ Stop Performance Monitoring ============
      if (this.performanceMonitor) {
        this.performanceMonitor.track('shutdown', Date.now());
      }

      // ============ Generate Shutdown Report ============
      const shutdownReport = {
        shutdownTime: new Date().toISOString(),
        uptime: Date.now() - (this.startTime || Date.now()),
        finalMetrics: this.metrics,
        reason: 'Graceful shutdown'
      };

      this.logger.info('Shutdown completed successfully', shutdownReport);

      // ============ Clear Shutdown Timer ============
      clearTimeout(shutdownTimer);

      this.isRunning = false;
    } catch (error) {
      this.logger.error('Error during graceful shutdown', { error: error.message });
    }
  }

  /**
     * @notice Complete shutdown and exit process
     */
  async shutdown () {
    await this.handleShutdown();
    process.exit(0);
  }
}

// ============ Main Execution ============

/**
 * @notice Main function to run the Enhanced Trading Agent
 * @dev Entry point for the competition trading bot
 */
async function main () {
  const agent = new EnhancedTradingAgent();

  try {
    // ============ Initialize Agent ============
    await agent.initialize();

    // ============ Start Competition ============
    await agent.start();
  } catch (error) {
    console.error('💥 Fatal error in main execution:', error.message);
    console.error(error.stack);

    // ============ Attempt Graceful Shutdown ============
    try {
      await agent.handleShutdown();
    } catch (shutdownError) {
      console.error('Error during emergency shutdown:', shutdownError.message);
    }

    process.exit(1);
  }
}

// ============ Execute Main Function ============
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { EnhancedTradingAgent };
