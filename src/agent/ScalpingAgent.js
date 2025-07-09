// ============ Imports ============
import { ethers } from 'ethers';
import { TradingStrategy } from './TradingStrategy.js';
import { RiskManager } from './RiskManager.js';
import { RecallClient } from '../integrations/RecallClient.js';
import { VincentClient } from '../integrations/VincentClient.js';
import { GaiaClient } from '../integrations/GaiaClient.js';
import { Logger } from '../utils/Logger.js';
import { CONFIG } from '../config/trading.js';

// ============ Constants ============
const AGENT_STATES = {
    INACTIVE: 'INACTIVE',
    INITIALIZING: 'INITIALIZING',
    ACTIVE: 'ACTIVE',
    STOPPING: 'STOPPING',
    ERROR: 'ERROR'
};

const COMPETITION_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * @title ScalpingAgent
 * @notice Main autonomous trading agent for Recall hackathon competition
 * @dev Orchestrates all components for high-frequency scalping strategy
 */
export class ScalpingAgent {
    constructor(config = {}) {
        // ============ Agent Configuration ============
        this.config = {
            ...CONFIG,
            ...config
        };
        
        // ============ Core Dependencies ============
        this.logger = new Logger('ScalpingAgent');
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
    async initialize() {
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
     * @notice Start the competition trading session
     * @dev Begins 1-hour trading competition with full monitoring
     */
    async startCompetition() {
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
            this._setupCompetitionTimer();
            
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
    async stop() {
        try {
            this.logger.info('Stopping ScalpingAgent...');
            this._setState(AGENT_STATES.STOPPING);
            
            // ============ Stop Trading Strategy ============
            if (this.tradingStrategy) {
                await this.tradingStrategy.stop();
            }
            
            // ============ Clear Competition Timer ============
            if (this.competitionTimer) {
                clearTimeout(this.competitionTimer);
                this.competitionTimer = null;
            }
            
            // ============ Calculate Final Performance ============
            await this._calculateFinalPerformance();
            
            // ============ Store Final Results ============
            await this._storeFinalResults();
            
            // ============ Cleanup Resources ============
            await this._cleanup();
            
            this._setState(AGENT_STATES.INACTIVE);
            this.logger.info('ScalpingAgent stopped successfully');
            
        } catch (error) {
            this.logger.error('Error stopping ScalpingAgent', { error: error.message });
            this._setState(AGENT_STATES.ERROR);
        }
    }

    // ============ Core Initialization Methods ============
    
    /**
     * @notice Initialize all external service clients
     * @dev Sets up connections to Recall, Vincent, and Gaia
     */
    async _initializeClients() {
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
            
            // ============ Initialize Gaia Client ============
            this.gaiaClient = new GaiaClient({
                apiKey: this.config.GAIA_API_KEY,
                nodeUrl: this.config.GAIA_NODE_URL || 'https://llama8b.gaia.domains/v1',
                model: this.config.GAIA_MODEL || 'llama8b'
            });
            await this.gaiaClient.initialize();
            
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
    async _initializeTradingComponents() {
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
            this.tradingStrategy = new TradingStrategy(
                this.recallClient,
                this.vincentClient,
                this.gaiaClient,
                this.logger
            );
            
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
    async _verifyPermissions() {
        try {
            this.logger.info('Verifying Vincent permissions...');
            
            // ============ Check App Permissions ============
            const permissions = await this.vincentClient.getPermissions();
            
            const requiredPermissions = [
                'token_transfer',
                'defi_interaction',
                'cross_chain_bridge'
            ];
            
            for (const permission of requiredPermissions) {
                if (!permissions.includes(permission)) {
                    throw new Error(`Missing required permission: ${permission}`);
                }
            }
            
            // ============ Verify Policy Configuration ============
            const policies = await this.vincentClient.getPolicies();
            
            this.logger.info('Permissions verified successfully', { 
                permissions: permissions.length,
                policies: policies.length
            });
            
        } catch (error) {
            this.logger.error('Permission verification failed', { error: error.message });
            throw error;
        }
    }

    // ============ Competition Management ============
    
    /**
     * @notice Setup competition timer for automatic stop
     * @dev Ensures trading stops exactly at competition end time
     */
    _setupCompetitionTimer() {
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
    async _recordStartingBalance() {
        try {
            // ============ Get Account Balance from Recall ============
            const accountInfo = await this.recallClient.getAccountInfo();
            this.performance.startingBalance = parseFloat(accountInfo.balance);
            this.performance.currentBalance = this.performance.startingBalance;
            
            this.logger.info('Starting balance recorded', {
                balance: this.performance.startingBalance
            });
            
        } catch (error) {
            this.logger.error('Failed to record starting balance', { error: error.message });
            // Use default if unable to fetch
            this.performance.startingBalance = 10000; // Default for testing
            this.performance.currentBalance = this.performance.startingBalance;
        }
    }

    // ============ Performance Monitoring ============
    
    /**
     * @notice Start continuous performance monitoring
     * @dev Tracks metrics and updates performance data
     */
    _startPerformanceMonitoring() {
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
    async _updatePerformanceMetrics() {
        try {
            // ============ Get Current Balance ============
            const accountInfo = await this.recallClient.getAccountInfo();
            this.performance.currentBalance = parseFloat(accountInfo.balance);
            
            // ============ Calculate Performance Metrics ============
            const strategyPerformance = this.tradingStrategy.performanceMetrics;
            
            this.performance.totalTrades = strategyPerformance.totalTrades;
            this.performance.successfulTrades = strategyPerformance.winningTrades;
            this.performance.totalProfit = this.performance.currentBalance - this.performance.startingBalance;
            this.performance.winRate = this.performance.totalTrades > 0 ? 
                this.performance.successfulTrades / this.performance.totalTrades : 0;
            
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
    async _updateHealthMetrics() {
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
    async _storeCompetitionStart() {
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
    async _storePerformanceSnapshot() {
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
    async _calculateFinalPerformance() {
        try {
            this.logger.info('Calculating final performance...');
            
            // ============ Final Balance Update ============
            const accountInfo = await this.recallClient.getAccountInfo();
            this.performance.currentBalance = parseFloat(accountInfo.balance);
            this.performance.totalProfit = this.performance.currentBalance - this.performance.startingBalance;
            
            // ============ Calculate Advanced Metrics ============
            const totalDuration = Date.now() - this.startTime;
            const annualizedReturn = (this.performance.totalProfit / this.performance.startingBalance) * 
                (365 * 24 * 60 * 60 * 1000 / totalDuration);
            
            // ============ Sharpe Ratio Calculation ============
            // Simplified calculation for competition context
            this.performance.sharpeRatio = this.performance.totalProfit > 0 ? 
                this.performance.totalProfit / (this.performance.maxDrawdown || 0.01) : 0;
            
            this.performance.finalMetrics = {
                totalDuration: totalDuration,
                annualizedReturn: annualizedReturn,
                tradesPerHour: this.performance.totalTrades / (totalDuration / (60 * 60 * 1000)),
                avgProfitPerTrade: this.performance.totalTrades > 0 ? 
                    this.performance.totalProfit / this.performance.totalTrades : 0
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

    // ============ Event Handling ============
    
    /**
     * @notice Setup event handlers for system events
     * @dev Configures event listeners for various system events
     */
    _setupEventHandlers() {
        // ============ Process Exit Handlers ============
        process.on('SIGINT', async () => {
            this.logger.info('Received SIGINT, graceful shutdown...');
            await this.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            this.logger.info('Received SIGTERM, graceful shutdown...');
            await this.stop();
            process.exit(0);
        });
        
        process.on('uncaughtException', async (error) => {
            this.logger.error('Uncaught exception', { error: error.message });
            await this._handleError(error);
        });
        
        process.on('unhandledRejection', async (reason, promise) => {
            this.logger.error('Unhandled rejection', { reason, promise });
            await this._handleError(new Error(`Unhandled rejection: ${reason}`));
        });
    }
    
    /**
     * @notice Setup event listeners for trading components
     * @dev Listens to events from strategy and risk manager
     */
    _setupComponentEvents() {
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
        }
    }

    // ============ Utility Methods ============
    
    /**
     * @notice Set agent state and emit state change event
     * @param {string} newState - New agent state
     */
    _setState(newState) {
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
    async _handleError(error) {
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
    async _performHealthCheck() {
        try {
            this.logger.info('Performing health check...');
            
            // ============ Check Client Connections ============
            const healthChecks = await Promise.allSettled([
                this.recallClient.healthCheck(),
                this.vincentClient.healthCheck(),
                this.gaiaClient.healthCheck()
            ]);
            
            const failures = healthChecks.filter(result => result.status === 'rejected');
            
            if (failures.length > 0) {
                throw new Error(`Health check failed: ${failures.length} services unavailable`);
            }
            
            this.logger.info('Health check passed - all systems operational');
            
        } catch (error) {
            this.logger.error('Health check failed', { error: error.message });
            throw error;
        }
    }

    // ============ Getter Methods ============
    
    /**
     * @notice Get current agent status
     * @returns {Object} Current agent status and metrics
     */
    getStatus() {
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
    getConfig() {
        return { ...this.config };
    }
}