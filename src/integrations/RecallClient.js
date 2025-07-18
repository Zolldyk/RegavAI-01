// ============ Imports ============
import { RecallAgentToolkit } from '@recallnet/agent-toolkit/mcp';
import axios from 'axios';
import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import config from '../utils/Config.js';
import logger from '../utils/Logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * @title Recall MCP Client
 * @author Regav-AI Team
 * @notice Advanced Recall network integration for competitive trading
 * @dev Handles trade execution, competition participation, and performance tracking via Recall's API
 */
class RecallClient extends EventEmitter {
  constructor () {
    super();

    // ============ Configuration ============
    this.config = config.getRecallConfig();
    this.tradingConfig = config.getTradingConfig();
    this.safetyConfig = config.getSafetyConfig();

    // ============ Client State ============
    this.isInitialized = false;
    this.isConnected = false;
    this.toolkit = null;
    this.transport = null;

    // ============ API Configuration ============
    this.apiConfig = {
      baseUrl: this.config.baseUrl || 'https://api.competitions.recall.network',
      sandboxUrl: this.config.sandboxUrl || 'https://api.sandbox.competitions.recall.network',
      apiKey: this.config.apiKey || process.env.TRADING_SIM_API_KEY,
      privateKey: this.config.privateKey || process.env.RECALL_PRIVATE_KEY,
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000
    };

    // ============ Competition Tracking ============
    this.competitionData = {
      id: null,
      startTime: null,
      endTime: null,
      rank: null,
      totalParticipants: 0,
      portfolioValue: 0,
      initialPortfolioValue: 0,
      pnl: 0,
      pnlPercent: 0,
      totalTrades: 0,
      winRate: 0,
      isActive: false
    };

    // ============ Trade Tracking ============
    this.trades = new Map();
    this.tradeHistory = [];
    this.activeOrders = new Map();

    // ============ Performance Metrics ============
    this.metrics = {
      tradesExecuted: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      lastTradeTime: null,
      averageExecutionTime: 0,
      profitFactor: 0,
      sharpeRatio: 0
    };

    // ============ Rate Limiting and Circuit Breaker ============
    this.rateLimiter = {
      lastRequestTime: 0,
      requestCount: 0,
      windowStart: Date.now(),
      maxRequestsPerMinute: 60
    };

    this.circuitBreaker = {
      isOpen: false,
      failures: 0,
      maxFailures: 5,
      resetTimeout: 30000, // 30 seconds
      lastFailureTime: 0
    };

    // ============ Account Information ============
    this.accountInfo = {
      agentId: null,
      walletAddress: null,
      isVerified: false,
      balance: 0,
      credits: 0
    };
  }

  // ============ Initialization and Connection ============

  /**
     * @notice Initialize the Recall client and establish connection
     * @dev Sets up the agent toolkit with proper configuration and credentials
     */
  async initialize () {
    try {
      logger.info('Initializing Recall client...', {
        network: this.config.network,
        baseUrl: this.apiConfig.baseUrl,
        agentName: this.config.agentName
      });

      // ============ Validate Configuration ============
      this._validateConfiguration();

      // ============ Initialize Network Connection ============
      await this._connectToNetwork();

      // ============ Initialize Agent Toolkit ============
      await this._initializeToolkit();

      // ============ Verify Account and Get Initial Data ============
      await this._loadAccountInformation();

      // ============ Set up Event Handlers ============
      this._setupEventHandlers();

      // ============ Initialize Competition Tracking ============
      await this._initializeCompetition();

      // ============ Initialize Performance Monitoring ============
      this._startPerformanceMonitoring();

      this.isInitialized = true;
      this.emit('initialized');

      logger.logRecallOperation('INITIALIZE', {
        success: true,
        network: this.config.network,
        agentName: this.config.agentName,
        agentId: this.accountInfo.agentId
      });
    } catch (error) {
      logger.error('Failed to initialize Recall client', { error: error.message });
      this.emit('error', error);
      throw error;
    }
  }

  /**
     * @notice Validate Recall configuration
     * @dev Ensures all required configuration is present and valid
     */
  _validateConfiguration () {
    const required = ['apiKey', 'network', 'agentName'];
    const missing = required.filter(field => !this.config[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required Recall configuration: ${missing.join(', ')}`);
    }

    // ============ Validate API Key Format ============
    if (!this.config.apiKey) {
      throw new Error('API key is required');
    }

    // Accept both pk_ format and registered API key format
    if (!this.config.apiKey.startsWith('pk_') && !this.config.apiKey.includes('_')) {
      throw new Error('Invalid Recall API key format');
    }

    // ============ Validate Network ============
    const validNetworks = ['testnet', 'mainnet', 'sandbox'];
    if (!validNetworks.includes(this.config.network)) {
      throw new Error(`Invalid Recall network: ${this.config.network}. Must be one of: ${validNetworks.join(', ')}`);
    }

    // ============ Set Correct Base URL Based on Network ============
    if (this.config.network === 'sandbox') {
      this.apiConfig.baseUrl = this.apiConfig.sandboxUrl;
    }
  }

  /**
     * @notice Connect to Recall network via API
     * @dev Establishes connection and verifies network accessibility
     */
  async _connectToNetwork () {
    try {
      // ============ Test API Connection ============
      const healthCheck = await this._makeApiCall('GET', '/api/health');

      if (healthCheck.status !== 'ok') {
        throw new Error('Recall API health check failed');
      }

      logger.info('Connected to Recall network successfully', {
        network: this.config.network,
        apiVersion: healthCheck.version,
        uptime: healthCheck.uptime
      });

      this.isConnected = true;
      this.emit('connected', healthCheck);
    } catch (error) {
      logger.error('Failed to connect to Recall network', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Initialize the Recall Agent Toolkit
     * @dev Sets up the toolkit with proper permissions and configuration
     */
  async _initializeToolkit () {
    try {
      // ============ Check if Private Key Available ============
      if (!this.apiConfig.privateKey) {
        logger.warn('No private key configured - Recall Agent Toolkit will not be available');
        logger.info('Using HTTP API only for Recall integration');
        return;
      }

      // ============ Load Wallet Credentials ============
      const privateKey = this.apiConfig.privateKey;

      // ============ Initialize Toolkit with Configuration ============
      this.toolkit = new RecallAgentToolkit({
        privateKey,
        configuration: {
          actions: {
            account: { read: true, write: true },
            bucket: { read: true, write: true }
          },
          context: {
            network: this.config.network,
            agentName: this.config.agentName,
            competitionId: this.config.competitionId
          }
        }
      });

      logger.info('Recall Agent Toolkit initialized successfully');
    } catch (error) {
      logger.warn('Failed to initialize Recall Agent Toolkit - using HTTP API only', { error: error.message });
      // Don't throw error - continue with HTTP API only
      this.toolkit = null;
    }
  }

  /**
     * @notice Load wallet credentials using Foundry cast (encrypted)
     * @dev Securely loads encrypted wallet credentials without exposing private keys
     * @return {object} Wallet configuration with private key
     */
  async _loadWalletCredentials () {
    const walletConfig = config.getWalletConfig();

    if (walletConfig.useEncrypted) {
      // ============ Use Foundry's Encrypted Wallet ============
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        logger.info('Loading encrypted wallet credentials...', {
          walletName: walletConfig.name
        });

        // ============ Load Private Key from Encrypted Wallet ============
        const passwordFile = walletConfig.passwordFile || `${process.env.HOME}/.foundry/keystore/${walletConfig.name}.password`;
        const keystorePath = `${process.env.HOME}/.foundry/keystores/${walletConfig.name}`;
        const { stdout: privateKey } = await execAsync(
                    `cast wallet private-key --keystore ${keystorePath} --password-file ${passwordFile}`
        );

        // ============ Get Wallet Address ============
        const address = await this._getWalletAddress(walletConfig.name);

        return {
          privateKey: privateKey.trim(),
          address
        };
      } catch (error) {
        logger.error('Failed to load encrypted wallet credentials', {
          error: error.message,
          walletName: walletConfig.name
        });
        throw new Error(`Cannot load encrypted wallet "${walletConfig.name}". Ensure Foundry cast is installed and wallet is properly imported.`);
      }
    } else {
      // ============ Fallback for Development (Not Recommended for Production) ============
      const privateKey = process.env.PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('No private key found. Please set up encrypted wallet or PRIVATE_KEY environment variable.');
      }

      logger.warn('Using unencrypted private key. This is not recommended for production.');

      // ============ Derive Address from Private Key ============
      const wallet = new ethers.Wallet(privateKey);

      return {
        privateKey,
        address: wallet.address
      };
    }
  }

  /**
     * @notice Get wallet address from Foundry cast
     * @param {string} walletName Wallet name in Foundry
     * @return {string} Wallet address
     */
  async _getWalletAddress (walletName) {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const keystorePath = `${process.env.HOME}/.foundry/keystores/${walletName}`;
      const passwordFile = '.wallet-password';
      const { stdout: address } = await execAsync(`cast wallet address --keystore ${keystorePath} --password-file ${passwordFile}`);
      return address.trim();
    } catch (error) {
      logger.warn('Could not get wallet address from cast', { error: error.message });
      return null;
    }
  }

  /**
     * @notice Load account information from Recall
     * @dev Gets account data, balances, and agent verification status
     */
  async _loadAccountInformation () {
    try {
      // ============ Get Agent Profile ============
      const profileResponse = await this._makeApiCall('GET', '/api/agent/profile');

      if (profileResponse.success) {
        const { agent, owner } = profileResponse;

        this.accountInfo = {
          agentId: agent.id,
          walletAddress: agent.walletAddress,
          isVerified: agent.isVerified,
          name: agent.name,
          description: agent.description,
          status: agent.status,
          ownerId: owner.id
        };

        logger.info('Agent profile loaded successfully', {
          agentId: this.accountInfo.agentId,
          isVerified: this.accountInfo.isVerified,
          status: this.accountInfo.status
        });
      }

      // ============ Get Account Balances ============
      await this._loadAccountBalances();

      // ============ Get Credit Information ============
      await this._loadCreditInformation();
    } catch (error) {
      logger.error('Failed to load account information', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Load account balances
     * @dev Retrieves token balances for the agent
     */
  async _loadAccountBalances () {
    try {
      const balancesResponse = await this._makeApiCall('GET', '/api/agent/balances');

      if (balancesResponse.success) {
        this.accountInfo.balance = balancesResponse.balances;

        // ============ Calculate Total Balance in USD ============
        this.accountInfo.totalBalance = balancesResponse.balances.reduce((total, balance) => {
          return total + (balance.amount * (balance.priceUsd || 0));
        }, 0);

        logger.info('Account balances loaded', {
          tokenCount: balancesResponse.balances.length,
          totalBalanceUsd: this.accountInfo.totalBalance
        });
      } else {
        // ============ Fallback: Use Default Balance ============
        this.accountInfo.totalBalance = 12000; // Default starting balance
        logger.warn('Failed to load account balances, using default balance', {
          defaultBalance: this.accountInfo.totalBalance
        });
      }
    } catch (error) {
      logger.error('Failed to load account balances', { error: error.message });

      // ============ Fallback: Use Default Balance ============
      this.accountInfo.totalBalance = 12000; // Default starting balance
      logger.warn('Using fallback balance due to API error', {
        fallbackBalance: this.accountInfo.totalBalance
      });
    }
  }

  /**
     * @notice Load credit information
     * @dev Retrieves credit balance for agent operations
     */
  async _loadCreditInformation () {
    try {
      const creditResponse = await this._makeApiCall('GET', '/api/agent/credit-info');

      if (creditResponse.success) {
        this.accountInfo.credits = parseFloat(creditResponse.credits);
        this.accountInfo.usedCredits = parseFloat(creditResponse.used);

        logger.info('Credit information loaded', {
          credits: this.accountInfo.credits,
          used: this.accountInfo.usedCredits
        });
      }
    } catch (error) {
      logger.error('Failed to load credit information', { error: error.message });
    }
  }

  /**
     * @notice Set up event handlers for the client
     * @dev Configures event listeners for various client operations
     */
  _setupEventHandlers () {
    // ============ Handle Trade Events ============
    this.on('trade_executed', (trade) => {
      this._handleTradeExecuted(trade);
    });

    this.on('trade_failed', (trade, error) => {
      this._handleTradeFailed(trade, error);
    });

    // ============ Handle Competition Events ============
    this.on('competition_update', (data) => {
      this._updateCompetitionData(data);
    });

    // ============ Handle Circuit Breaker Events ============
    this.on('circuit_breaker_open', () => {
      logger.warn('Circuit breaker opened - pausing trading operations');
    });

    this.on('circuit_breaker_closed', () => {
      logger.info('Circuit breaker closed - resuming trading operations');
    });

    // ============ Handle Connection Events ============
    this.on('connection_lost', () => {
      logger.warn('Connection to Recall lost - attempting reconnection...');
      this._attemptReconnection();
    });
  }

  /**
     * @notice Initialize competition tracking
     * @dev Sets up competition monitoring and registration if needed
     */
  async _initializeCompetition () {
    try {
      if (this.config.competitionId) {
        // ============ Join Specific Competition ============
        await this._joinCompetition(this.config.competitionId);
      } else if (this.config.autoRegister) {
        // ============ Auto-Register for Available Competitions ============
        await this._autoRegisterCompetition();
      }

      // ============ Start Competition Monitoring ============
      if (this.competitionData.id) {
        this._startCompetitionMonitoring();
      }
    } catch (error) {
      logger.warn('Failed to initialize competition tracking', { error: error.message });
      // Don't throw - competition is optional
    }
  }

  // ============ Trading Operations ============

  /**
     * @notice Execute a trade on the Recall network
     * @param {object} tradeParams Trade parameters
     * @return {object} Trade execution result
     */
  async executeTrade (tradeParams) {
    const timer = logger.createPerformanceTimer('recall_trade_execution');
    const tradeId = uuidv4();

    try {
      // ============ Pre-execution Validations ============
      this._validateTradeParams(tradeParams);

      // ============ Check Circuit Breaker ============
      if (this.circuitBreaker.isOpen) {
        throw new Error('Circuit breaker is open - trading suspended');
      }

      // ============ Check Rate Limits ============
      await this._checkRateLimit();

      // ============ Check Safety Limits ============
      this._checkSafetyLimits(tradeParams);

      // ============ Prepare Trade Execution ============
      const trade = {
        id: tradeId,
        timestamp: Date.now(),
        ...tradeParams,
        status: 'PENDING'
      };

      // ============ Store Trade in Active Orders ============
      this.activeOrders.set(tradeId, trade);

      logger.logTrade('info', 'Executing trade', {
        tradeId,
        pair: tradeParams.pair,
        action: tradeParams.action,
        amount: tradeParams.amount,
        price: tradeParams.price
      });

      // ============ Execute Trade via Recall API ============
      const result = await this._executeTradeViaAPI(trade);

      // ============ Process Successful Trade ============
      const executionTime = timer({
        success: true,
        tradeId,
        pair: tradeParams.pair
      });

      const completedTrade = {
        ...trade,
        ...result,
        status: 'COMPLETED',
        executionTime
      };

      // ============ Update Tracking ============
      this.activeOrders.delete(tradeId);
      this.trades.set(tradeId, completedTrade);
      this.tradeHistory.push(completedTrade);
      this._updateMetrics(completedTrade);
      this._updateCircuitBreaker(true);

      // ============ Log Successful Execution ============
      logger.logTradeSuccess({
        tradeId,
        pair: tradeParams.pair,
        action: tradeParams.action,
        amount: tradeParams.amount,
        executedPrice: result.executedPrice,
        profit: result.profit,
        executionTime
      });

      this.emit('trade_executed', completedTrade);
      return completedTrade;
    } catch (error) {
      // ============ Handle Trade Failure ============
      const executionTime = timer({
        success: false,
        error: error.message,
        tradeId
      });

      const failedTrade = {
        id: tradeId,
        timestamp: Date.now(),
        ...tradeParams,
        status: 'FAILED',
        error: error.message,
        executionTime
      };

      // ============ Update Tracking ============
      this.activeOrders.delete(tradeId);
      this.trades.set(tradeId, failedTrade);
      this.tradeHistory.push(failedTrade);
      this._updateMetrics(failedTrade);
      this._updateCircuitBreaker(false);

      // ============ Log Trade Failure ============
      logger.logTradeFailure({
        tradeId,
        pair: tradeParams.pair,
        action: tradeParams.action,
        amount: tradeParams.amount
      }, error);

      this.emit('trade_failed', failedTrade, error);
      throw error;
    }
  }

  /**
     * @notice Execute trade via Recall API
     * @param {object} trade Trade object
     * @return {object} Execution result
     */
  async _executeTradeViaAPI (trade) {
    try {
      // ============ Map Trade Parameters to Recall API Format ============
      const recallParams = this._mapTradeToRecallFormat(trade);

      // ============ Execute Trade Through Recall API ============
      const response = await this._makeApiCall('POST', '/api/trade/execute', recallParams);

      // ============ Process and Validate Result ============
      if (!response.success) {
        throw new Error(response.error || 'Trade execution failed');
      }

      return this._processTradeResult(response);
    } catch (error) {
      logger.error('Trade execution failed via API', {
        error: error.message,
        tradeId: trade.id
      });
      throw error;
    }
  }

  /**
     * @notice Map trade parameters to Recall API format
     * @param {object} trade Trade object
     * @return {object} Recall-formatted trade parameters
     */
  _mapTradeToRecallFormat (trade) {
    const {
      pair,
      action, // 'BUY' or 'SELL'
      amount,
      price,
      orderType = 'MARKET',
      slippage = 0.005,
      reason
    } = trade;

    // ============ Parse Trading Pair ============
    const [baseToken, quoteToken] = pair.split('/');

    // ============ Determine Token Addresses Based on Trading Pair ============
    const tokenAddresses = this._getTokenAddresses(baseToken, quoteToken);

    return {
      fromToken: action === 'BUY' ? tokenAddresses.quote : tokenAddresses.base,
      toToken: action === 'BUY' ? tokenAddresses.base : tokenAddresses.quote,
      amount: amount.toString(),
      reason: reason || `Scalping AI trade: ${action} ${amount} ${pair}${price ? ` at ${price}` : ''}`,
      slippageTolerance: (slippage * 100).toString(), // Convert to percentage string
      ...(price && orderType === 'LIMIT' && { limitPrice: price.toString() })
    };
  }

  /**
     * @notice Get token addresses for trading pair
     * @param {string} baseToken Base token symbol
     * @param {string} quoteToken Quote token symbol
     * @return {object} Token addresses
     */
  _getTokenAddresses (baseToken, quoteToken) {
    // ============ Token Address Mapping (Testnet/Mainnet) ============
    const tokenAddresses = {
      // Ethereum Mainnet addresses
      ETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      BTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
      WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'

      // Add more token addresses as needed
      // SOL, MATIC, etc. based on supported chains
    };

    return {
      base: tokenAddresses[baseToken.toUpperCase()] || tokenAddresses.ETH,
      quote: tokenAddresses[quoteToken.toUpperCase()] || tokenAddresses.USDC
    };
  }

  /**
     * @notice Process trade execution result
     * @param {object} response Raw response from Recall API
     * @return {object} Processed trade result
     */
  _processTradeResult (response) {
    const transaction = response.transaction;

    return {
      transactionHash: transaction.id,
      executedPrice: parseFloat(transaction.price),
      executedAmount: parseFloat(transaction.toAmount),
      fromAmount: parseFloat(transaction.fromAmount),
      profit: this._calculateProfit(transaction),
      fee: this._calculateFee(transaction),
      gasUsed: transaction.gasUsed || 0,
      timestamp: new Date(transaction.timestamp).getTime(),
      success: transaction.success || true
    };
  }

  // ============ Account and Portfolio Management ============

  /**
     * @notice Get current portfolio value and balances
     * @return {object} Portfolio information
     */
  async getPortfolio () {
    try {
      const portfolioResponse = await this._makeApiCall('GET', '/api/agent/portfolio');

      if (!portfolioResponse.success) {
        throw new Error('Failed to get portfolio data');
      }

      const portfolio = portfolioResponse;

      // ============ Update Competition Data ============
      this.competitionData.portfolioValue = portfolio.totalValue;
      this.competitionData.pnl = this._calculatePnL(portfolio);
      this.competitionData.pnlPercent = this._calculatePnLPercentage(portfolio);

      return {
        totalValue: portfolio.totalValue,
        tokens: portfolio.tokens,
        pnl: this.competitionData.pnl,
        pnlPercentage: this.competitionData.pnlPercent,
        source: portfolio.source,
        snapshotTime: portfolio.snapshotTime,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get portfolio', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Get trade history from Recall
     * @param {number} limit Maximum number of trades to retrieve
     * @return {Array} Array of historical trades
     */
  async getTradeHistory (limit = 100) {
    try {
      const historyResponse = await this._makeApiCall('GET', '/api/agent/trades', { limit });

      if (!historyResponse.success) {
        throw new Error('Failed to get trade history');
      }

      return historyResponse.trades;
    } catch (error) {
      logger.error('Failed to get trade history', { error: error.message });
      throw error;
    }
  }

  // ============ Competition Management ============

  /**
     * @notice Join a specific competition
     * @param {string} competitionId Competition ID to join
     */
  async _joinCompetition (competitionId) {
    try {
      const response = await this._makeApiCall('POST', `/api/competitions/${competitionId}/agents/${this.accountInfo.agentId}`);

      if (response.success) {
        this.competitionData.id = competitionId;
        this.competitionData.isActive = true;

        // ============ Get Competition Details ============
        await this._loadCompetitionDetails(competitionId);

        logger.logRecallOperation('JOIN_COMPETITION', {
          competitionId,
          agentId: this.accountInfo.agentId,
          success: true
        });
      }
    } catch (error) {
      logger.error('Failed to join competition', { competitionId, error: error.message });
      throw error;
    }
  }

  /**
     * @notice Load competition details
     * @param {string} competitionId Competition ID
     */
  async _loadCompetitionDetails (competitionId) {
    try {
      const response = await this._makeApiCall('GET', `/api/competitions/${competitionId}`);

      if (response.success) {
        const competition = response.competition;

        this.competitionData = {
          ...this.competitionData,
          name: competition.name,
          description: competition.description,
          startDate: competition.startDate,
          endDate: competition.endDate,
          status: competition.status,
          type: competition.type
        };
      }
    } catch (error) {
      logger.error('Failed to load competition details', { error: error.message });
    }
  }

  /**
     * @notice Auto-register for available competitions
     */
  async _autoRegisterCompetition () {
    try {
      // ============ Get Available Competitions ============
      const competitions = await this._getAvailableCompetitions();

      // ============ Find Suitable Competition ============
      const suitableCompetition = competitions.find(comp =>
        comp.status === 'active' &&
                comp.type === 'trading' &&
                !comp.requiresInvite
      );

      if (suitableCompetition) {
        await this._joinCompetition(suitableCompetition.id);
        logger.info('Auto-registered for competition', {
          competitionId: suitableCompetition.id,
          name: suitableCompetition.name
        });
      } else {
        logger.warn('No suitable competitions found for auto-registration');
      }
    } catch (error) {
      logger.error('Failed to auto-register for competition', { error: error.message });
    }
  }

  /**
     * @notice Get available competitions
     * @return {Array} Array of available competitions
     */
  async _getAvailableCompetitions () {
    try {
      const response = await this._makeApiCall('GET', '/api/competitions', {
        status: 'active',
        type: 'trading'
      });

      return response.competitions || [];
    } catch (error) {
      logger.error('Failed to get available competitions', { error: error.message });
      return [];
    }
  }

  /**
     * @notice Start competition monitoring
     * @dev Periodically updates competition data and rankings
     */
  _startCompetitionMonitoring () {
    if (!this.competitionData.id) {
      return;
    }

    const interval = (this.config.metricsInterval || 30) * 1000; // Convert to milliseconds

    this.competitionMonitor = setInterval(async () => {
      try {
        await this._updateCompetitionMetrics();
      } catch (error) {
        logger.error('Failed to update competition metrics', { error: error.message });
      }
    }, interval);

    logger.info('Competition monitoring started', {
      competitionId: this.competitionData.id,
      intervalSeconds: this.config.metricsInterval || 30
    });
  }

  /**
     * @notice Start performance monitoring
     * @dev Periodically updates performance metrics and portfolio data
     */
  _startPerformanceMonitoring () {
    const interval = (this.config.performanceInterval || 60) * 1000; // Convert to milliseconds

    this.performanceMonitor = setInterval(async () => {
      try {
        // ============ Update Portfolio Data ============
        await this.getPortfolio();

        // ============ Calculate Performance Metrics ============
        this._calculateAdvancedMetrics();

        // ============ Emit Performance Update ============
        this.emit('performance_update', {
          metrics: this.metrics,
          competitionData: this.competitionData,
          accountInfo: this.accountInfo
        });
      } catch (error) {
        logger.error('Failed to update performance metrics', { error: error.message });
      }
    }, interval);

    logger.info('Performance monitoring started', {
      intervalSeconds: this.config.performanceInterval || 60
    });
  }

  /**
     * @notice Update competition metrics and rankings
     */
  async _updateCompetitionMetrics () {
    try {
      const response = await this._makeApiCall('GET', `/api/competitions/${this.competitionData.id}/leaderboard`);

      if (response.success) {
        const leaderboard = response.leaderboard;
        const myEntry = leaderboard.find(entry => entry.agentId === this.accountInfo.agentId);

        if (myEntry) {
          this.competitionData.rank = myEntry.rank;
          this.competitionData.totalParticipants = leaderboard.length;
          this.competitionData.portfolioValue = myEntry.portfolioValue;
        }

        this.emit('competition_update', this.competitionData);

        logger.logRecallOperation('COMPETITION_UPDATE', {
          competitionId: this.competitionData.id,
          rank: this.competitionData.rank,
          totalParticipants: this.competitionData.totalParticipants
        });
      }
    } catch (error) {
      logger.error('Failed to update competition metrics', { error: error.message });
    }
  }

  // ============ Utility and Helper Methods ============

  /**
     * @notice Validate trade parameters
     * @param {object} tradeParams Trade parameters to validate
     */
  _validateTradeParams (tradeParams) {
    const required = ['pair', 'action', 'amount'];
    const missing = required.filter(field => !tradeParams[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required trade parameters: ${missing.join(', ')}`);
    }

    // ============ Validate Action ============
    if (!['BUY', 'SELL'].includes(tradeParams.action.toUpperCase())) {
      throw new Error(`Invalid trade action: ${tradeParams.action}. Must be 'BUY' or 'SELL'`);
    }

    // ============ Validate Amount ============
    if (typeof tradeParams.amount !== 'number' || tradeParams.amount <= 0) {
      throw new Error('Trade amount must be a positive number');
    }

    // ============ Validate Trading Pair ============
    if (!tradeParams.pair.includes('/')) {
      throw new Error('Invalid trading pair format. Must be BASE/QUOTE (e.g., BTC/USDT)');
    }

    const [base, quote] = tradeParams.pair.split('/');
    if (!base || !quote) {
      throw new Error('Invalid trading pair format. Both base and quote tokens required');
    }

    // ============ Validate Supported Pairs ============
    if (this.tradingConfig.pairs && !this.tradingConfig.pairs.includes(tradeParams.pair)) {
      logger.warn(`Trading pair ${tradeParams.pair} not in configured pairs list`);
    }
  }

  /**
     * @notice Check rate limiting
     * @dev Implements rate limiting to prevent API abuse
     */
  async _checkRateLimit () {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window

    // ============ Reset Window if Needed ============
    if (now - this.rateLimiter.windowStart > windowMs) {
      this.rateLimiter.windowStart = now;
      this.rateLimiter.requestCount = 0;
    }

    // ============ Check Rate Limit ============
    if (this.rateLimiter.requestCount >= this.rateLimiter.maxRequestsPerMinute) {
      const waitTime = windowMs - (now - this.rateLimiter.windowStart);
      throw new Error(`Rate limit exceeded. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // ============ Increment Request Count ============
    this.rateLimiter.requestCount++;
    this.rateLimiter.lastRequestTime = now;
  }

  /**
     * @notice Check safety limits before trade execution
     * @param {object} tradeParams Trade parameters
     */
  _checkSafetyLimits (tradeParams) {
    // ============ Check Position Size Limit ============
    const positionValueUsd = tradeParams.amount * (tradeParams.price || this._getEstimatedPrice(tradeParams.pair));
    if (positionValueUsd > this.tradingConfig.maxPositionSizeUsd) {
      throw new Error(`Position size ${positionValueUsd} exceeds maximum ${this.tradingConfig.maxPositionSizeUsd}`);
    }

    // ============ Check Trade Frequency Limit ============
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const recentTrades = this.tradeHistory.filter(trade => trade.timestamp > oneHourAgo);

    if (recentTrades.length >= this.tradingConfig.maxTradesPerHour) {
      throw new Error(`Trade frequency limit exceeded: ${recentTrades.length}/${this.tradingConfig.maxTradesPerHour} per hour`);
    }

    // ============ Check Maximum Loss Limit ============
    if (this.metrics.currentDrawdown > this.safetyConfig.maxLossPercentage) {
      throw new Error(`Maximum loss limit exceeded: ${this.metrics.currentDrawdown}%`);
    }

    // ============ Check Emergency Stop ============
    if (this.safetyConfig.emergencyStopEnabled && this._shouldEmergencyStop()) {
      throw new Error('Emergency stop triggered - trading suspended');
    }

    // ============ Check Account Credits ============
    if (this.accountInfo.credits < this.safetyConfig.minCreditsRequired) {
      throw new Error(`Insufficient credits: ${this.accountInfo.credits} < ${this.safetyConfig.minCreditsRequired}`);
    }
  }

  /**
     * @notice Get estimated price for trading pair
     * @param {string} pair Trading pair
     * @return {number} Estimated price
     */
  _getEstimatedPrice (pair) {
    // ============ Fallback Price Estimation ============
    const priceMap = {
      'BTC/USDT': 45000,
      'ETH/USDT': 2500,
      'SOL/USDC': 100,
      'BTC/USDC': 45000,
      'ETH/USDC': 2500
    };

    return priceMap[pair] || 1000; // Default fallback
  }

  /**
     * @notice Check if emergency stop should be triggered
     * @return {boolean} True if emergency stop should be triggered
     */
  _shouldEmergencyStop () {
    // ============ Check Consecutive Failures ============
    const recentFailures = this.tradeHistory
      .slice(-10) // Last 10 trades
      .filter(trade => trade.status === 'FAILED').length;

    if (recentFailures >= this.safetyConfig.circuitBreakerThreshold) {
      return true;
    }

    // ============ Check Rapid Loss ============
    const recentLoss = this.tradeHistory
      .slice(-5) // Last 5 trades
      .reduce((total, trade) => total + (trade.profit || 0), 0);

    if (recentLoss < -this.tradingConfig.maxPositionSizeUsd * 0.5) {
      return true;
    }

    // ============ Check Portfolio Drawdown ============
    if (this.metrics.currentDrawdown > this.safetyConfig.emergencyStopDrawdown) {
      return true;
    }

    return false;
  }

  /**
     * @notice Update circuit breaker state
     * @param {boolean} success Whether the operation was successful
     */
  _updateCircuitBreaker (success) {
    if (success) {
      // ============ Reset Failure Count on Success ============
      this.circuitBreaker.failures = 0;
      if (this.circuitBreaker.isOpen) {
        this.circuitBreaker.isOpen = false;
        this.emit('circuit_breaker_closed');
      }
    } else {
      // ============ Increment Failure Count ============
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailureTime = Date.now();

      // ============ Open Circuit Breaker if Threshold Exceeded ============
      if (this.circuitBreaker.failures >= this.circuitBreaker.maxFailures) {
        this.circuitBreaker.isOpen = true;
        this.emit('circuit_breaker_open');

        // ============ Auto-Reset After Timeout ============
        setTimeout(() => {
          this.circuitBreaker.isOpen = false;
          this.circuitBreaker.failures = 0;
          this.emit('circuit_breaker_closed');
        }, this.circuitBreaker.resetTimeout);
      }
    }
  }

  /**
     * @notice Update trading metrics
     * @param {object} trade Completed trade
     */
  _updateMetrics (trade) {
    this.metrics.tradesExecuted++;
    this.metrics.lastTradeTime = trade.timestamp;

    if (trade.status === 'COMPLETED') {
      this.metrics.successfulTrades++;

      // ============ Update Profit/Loss Tracking ============
      const profit = trade.profit || 0;
      if (profit > 0) {
        this.metrics.totalProfit += profit;
      } else {
        this.metrics.totalLoss += Math.abs(profit);
      }

      // ============ Update Drawdown Calculation ============
      this._updateDrawdown(profit);

      // ============ Update Average Execution Time ============
      const totalTime = this.metrics.averageExecutionTime * (this.metrics.successfulTrades - 1) + trade.executionTime;
      this.metrics.averageExecutionTime = totalTime / this.metrics.successfulTrades;
    } else {
      this.metrics.failedTrades++;
    }

    // ============ Calculate Win Rate ============
    this.metrics.winRate = (this.metrics.successfulTrades / this.metrics.tradesExecuted) * 100;

    // ============ Update Competition Data ============
    this.competitionData.totalTrades = this.metrics.tradesExecuted;
    this.competitionData.winRate = this.metrics.winRate;
  }

  /**
     * @notice Calculate advanced performance metrics
     * @dev Calculates Sharpe ratio, profit factor, and other advanced metrics
     */
  _calculateAdvancedMetrics () {
    // ============ Calculate Profit Factor ============
    if (this.metrics.totalLoss > 0) {
      this.metrics.profitFactor = this.metrics.totalProfit / this.metrics.totalLoss;
    } else {
      this.metrics.profitFactor = this.metrics.totalProfit > 0 ? Infinity : 0;
    }

    // ============ Calculate Sharpe Ratio (Simplified) ============
    const completedTrades = this.tradeHistory.filter(trade => trade.status === 'COMPLETED');
    if (completedTrades.length > 1) {
      const returns = completedTrades.map(trade => (trade.profit || 0) / this.competitionData.portfolioValue);
      const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      this.metrics.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    }
  }

  /**
     * @notice Update drawdown calculation
     * @param {number} profit Profit/loss from trade
     */
  _updateDrawdown (profit) {
    if (profit < 0) {
      // ============ Increase Drawdown on Loss ============
      const portfolioValue = this.competitionData.portfolioValue || 10000; // Default fallback
      this.metrics.currentDrawdown += Math.abs(profit / portfolioValue) * 100;
      this.metrics.maxDrawdown = Math.max(this.metrics.maxDrawdown, this.metrics.currentDrawdown);
    } else {
      // ============ Reduce Drawdown on Profit ============
      const portfolioValue = this.competitionData.portfolioValue || 10000;
      this.metrics.currentDrawdown = Math.max(0, this.metrics.currentDrawdown - (profit / portfolioValue) * 100);
    }
  }

  /**
     * @notice Calculate profit from trade transaction
     * @param {object} transaction Trade transaction data
     * @return {number} Calculated profit
     */
  _calculateProfit (transaction) {
    try {
      // ============ Calculate Profit Based on Trade Direction ============
      const fromAmount = parseFloat(transaction.fromAmount);
      const toAmount = parseFloat(transaction.toAmount);
      const price = parseFloat(transaction.price);

      // ============ Simple Profit Calculation ============
      // For more complex calculations, consider trade direction and slippage
      const inputValueUsd = fromAmount * (transaction.fromTokenPrice || 1);
      const outputValueUsd = toAmount * (transaction.toTokenPrice || price || 1);

      return outputValueUsd - inputValueUsd;
    } catch (error) {
      logger.error('Failed to calculate profit', { error: error.message, transaction });
      return 0;
    }
  }

  /**
     * @notice Calculate fee from trade transaction
     * @param {object} transaction Trade transaction data
     * @return {number} Calculated fee
     */
  _calculateFee (transaction) {
    try {
      // ============ Extract Fee Information from Transaction ============
      return parseFloat(transaction.fee) || parseFloat(transaction.gasUsed) * parseFloat(transaction.gasPrice) || 0;
    } catch (error) {
      logger.error('Failed to calculate fee', { error: error.message, transaction });
      return 0;
    }
  }

  /**
     * @notice Calculate PnL from portfolio
     * @param {object} portfolio Portfolio data
     * @return {number} Calculated PnL
     */
  _calculatePnL (portfolio) {
    // ============ Calculate PnL Based on Initial Portfolio Value ============
    if (!this.competitionData.initialPortfolioValue) {
      this.competitionData.initialPortfolioValue = portfolio.totalValue;
      return 0;
    }

    return portfolio.totalValue - this.competitionData.initialPortfolioValue;
  }

  /**
     * @notice Calculate PnL percentage
     * @param {object} portfolio Portfolio data
     * @return {number} PnL percentage
     */
  _calculatePnLPercentage (portfolio) {
    const initialValue = this.competitionData.initialPortfolioValue;
    if (!initialValue || initialValue === 0) {
      return 0;
    }

    return ((portfolio.totalValue - initialValue) / initialValue) * 100;
  }

  /**
     * @notice Make API call to Recall with retry logic
     * @param {string} method HTTP method
     * @param {string} endpoint API endpoint
     * @param {object} data Request data
     * @return {object} API response
     */
  async _makeApiCall (method, endpoint, data = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.apiConfig.retryAttempts; attempt++) {
      try {
        const url = `${this.apiConfig.baseUrl}${endpoint}`;
        const config = {
          method,
          url,
          headers: {
            Authorization: `Bearer ${this.apiConfig.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': `${this.config.agentName}/1.0.0`
          },
          timeout: this.apiConfig.timeout
        };

        if (method !== 'GET') {
          config.data = data;
        } else {
          config.params = data;
        }

        const response = await axios(config);

        // ============ Log Successful API Call ============
        logger.debug('Recall API call successful', {
          method,
          endpoint,
          status: response.status,
          attempt
        });

        return response.data;
      } catch (error) {
        lastError = error;

        logger.error('Recall API call failed', {
          method,
          endpoint,
          error: error.message,
          status: error.response?.status,
          attempt,
          willRetry: attempt < this.apiConfig.retryAttempts
        });

        // ============ Check if Error is Retryable ============
        const isRetryable = this._isRetryableError(error);

        if (!isRetryable || attempt === this.apiConfig.retryAttempts) {
          break;
        }

        // ============ Wait Before Retry ============
        await this._sleep(this.apiConfig.retryDelay * attempt);
      }
    }

    throw lastError;
  }

  /**
     * @notice Check if error is retryable
     * @param {Error} error Error object
     * @return {boolean} True if error is retryable
     */
  _isRetryableError (error) {
    // ============ Network Errors are Retryable ============
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return true;
    }

    // ============ Timeout Errors are Retryable ============
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return true;
    }

    // ============ HTTP Status Codes ============
    if (error.response) {
      const status = error.response.status;
      // Retry on server errors (5xx) and rate limiting (429)
      return status >= 500 || status === 429;
    }

    return false;
  }

  /**
     * @notice Attempt reconnection to Recall network
     * @dev Tries to re-establish connection after connection loss
     */
  async _attemptReconnection () {
    if (this.isConnected) {
      return; // Already connected
    }

    const maxAttempts = 5;
    let attempt = 1;

    while (attempt <= maxAttempts && !this.isConnected) {
      try {
        logger.info(`Attempting reconnection to Recall (${attempt}/${maxAttempts})...`);

        await this._connectToNetwork();

        if (this.isConnected) {
          logger.info('Successfully reconnected to Recall network');
          this.emit('reconnected');
          return;
        }
      } catch (error) {
        logger.error(`Reconnection attempt ${attempt} failed`, { error: error.message });
      }

      attempt++;
      await this._sleep(5000 * attempt); // Exponential backoff
    }

    logger.error('Failed to reconnect to Recall network after maximum attempts');
    this.emit('reconnection_failed');
  }

  /**
     * @notice Sleep for specified milliseconds
     * @param {number} ms Milliseconds to sleep
     */
  _sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ Event Handlers ============

  /**
     * @notice Handle successful trade execution
     * @param {object} trade Trade data
     */
  _handleTradeExecuted (trade) {
    logger.logTradeSuccess(trade);
    this._updateCircuitBreaker(true);
  }

  /**
     * @notice Handle failed trade execution
     * @param {object} trade Trade data
     * @param {Error} error Error details
     */
  _handleTradeFailed (trade, error) {
    logger.logTradeFailure(trade, error);
    this._updateCircuitBreaker(false);
  }

  /**
     * @notice Update competition data
     * @param {object} data Competition data update
     */
  _updateCompetitionData (data) {
    Object.assign(this.competitionData, data);
    this.emit('competition_data_updated', this.competitionData);
  }

  // ============ Public API ============

  /**
     * @notice Get current client status
     * @return {object} Client status information
     */
  getStatus () {
    return {
      isInitialized: this.isInitialized,
      isConnected: this.isConnected,
      agentId: this.accountInfo.agentId,
      competitionId: this.competitionData.id,
      competitionActive: this.competitionData.isActive,
      metrics: { ...this.metrics },
      circuitBreaker: {
        isOpen: this.circuitBreaker.isOpen,
        failures: this.circuitBreaker.failures
      },
      activeOrders: this.activeOrders.size,
      totalTrades: this.trades.size,
      credits: this.accountInfo.credits,
      portfolioValue: this.competitionData.portfolioValue
    };
  }

  /**
     * @notice Get competition data
     * @return {object} Current competition data
     */
  getCompetitionData () {
    return { ...this.competitionData };
  }

  /**
     * @notice Get trading metrics
     * @return {object} Current trading metrics
     */
  getMetrics () {
    return { ...this.metrics };
  }

  /**
     * @notice Get account information
     * @return {object} Account information
     */
  getAccountInfo () {
    return {
      ...this.accountInfo,
      balance: this.accountInfo.totalBalance || 0 // Add balance property for compatibility
    };
  }

  /**
     * @notice Reset client state (for testing/debugging)
     * @dev Clears trade history and resets metrics
     */
  resetState () {
    this.trades.clear();
    this.activeOrders.clear();
    this.tradeHistory = [];

    this.metrics = {
      tradesExecuted: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      lastTradeTime: null,
      averageExecutionTime: 0,
      profitFactor: 0,
      sharpeRatio: 0
    };

    logger.info('Recall client state reset');
    this.emit('state_reset');
  }

  /**
   * @notice Get or create a storage bucket for data persistence
   * @param {string} bucketName - Name of the bucket to get or create
   * @returns {Object} Bucket object with name and metadata
   */
  async getOrCreateBucket (bucketName) {
    try {
      // Initialize storage if not exists
      if (!this.storage) {
        this.storage = new Map();
      }

      // Check if bucket already exists
      if (!this.storage.has(bucketName)) {
        // Create new bucket
        this.storage.set(bucketName, new Map());
        logger.info('Created new storage bucket', { bucketName });
      }

      return {
        bucket: bucketName,
        name: bucketName,
        created: this.storage.get(bucketName).size === 0,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Failed to get or create bucket', { bucketName, error: error.message });
      throw error;
    }
  }

  /**
   * @notice Add an object to a storage bucket
   * @param {string} bucketName - Name of the bucket
   * @param {string} key - Object key
   * @param {string} data - Data to store (should be JSON string)
   * @returns {Object} Storage operation result
   */
  async addObject (bucketName, key, data) {
    try {
      // Ensure bucket exists
      await this.getOrCreateBucket(bucketName);

      // Store the data
      const bucket = this.storage.get(bucketName);
      bucket.set(key, {
        data,
        timestamp: Date.now(),
        size: data.length
      });

      logger.debug('Added object to storage bucket', {
        bucketName,
        key,
        dataSize: data.length
      });

      return {
        success: true,
        bucket: bucketName,
        key,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Failed to add object to bucket', {
        bucketName,
        key,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * @notice Get an object from a storage bucket
   * @param {string} bucketName - Name of the bucket
   * @param {string} key - Object key
   * @returns {string|null} Stored data or null if not found
   */
  async getObject (bucketName, key) {
    try {
      if (!this.storage || !this.storage.has(bucketName)) {
        return null;
      }

      const bucket = this.storage.get(bucketName);
      const storedObject = bucket.get(key);

      return storedObject ? storedObject.data : null;
    } catch (error) {
      logger.error('Failed to get object from bucket', {
        bucketName,
        key,
        error: error.message
      });
      return null;
    }
  }

  /**
     * @notice Disconnect from Recall network
     */
  async disconnect () {
    try {
      // ============ Stop Monitoring ============
      if (this.competitionMonitor) {
        clearInterval(this.competitionMonitor);
        this.competitionMonitor = null;
      }

      if (this.performanceMonitor) {
        clearInterval(this.performanceMonitor);
        this.performanceMonitor = null;
      }

      // ============ Disconnect Toolkit ============
      if (this.toolkit && typeof this.toolkit.disconnect === 'function') {
        await this.toolkit.disconnect();
      }

      // ============ Update State ============
      this.isConnected = false;
      this.isInitialized = false;

      logger.logRecallOperation('DISCONNECT', { success: true });
      this.emit('disconnected');
    } catch (error) {
      logger.error('Failed to disconnect from Recall', { error: error.message });
      throw error;
    }
  }

  /**
     * @notice Emergency stop all trading operations
     * @dev Immediately stops all trading and sets emergency flag
     */
  emergencyStop () {
    // ============ Open Circuit Breaker ============
    this.circuitBreaker.isOpen = true;
    this.circuitBreaker.failures = this.circuitBreaker.maxFailures;

    // ============ Cancel All Active Orders ============
    this.activeOrders.clear();

    // ============ Set Emergency Flag ============
    this.safetyConfig.emergencyStopEnabled = true;

    logger.warn('EMERGENCY STOP ACTIVATED - All trading operations suspended');
    this.emit('emergency_stop');
  }

  /**
     * @notice Resume trading operations after emergency stop
     * @dev Resets emergency state and circuit breaker
     */
  resumeTrading () {
    // ============ Reset Circuit Breaker ============
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.failures = 0;

    // ============ Clear Emergency Flag ============
    this.safetyConfig.emergencyStopEnabled = false;

    logger.info('Trading operations resumed');
    this.emit('trading_resumed');
  }
}

export default RecallClient;
