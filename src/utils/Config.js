// ============ Imports ============
import dotenv from 'dotenv';
import Joi from 'joi';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import logger from './Logger.js';

// Load environment variables
dotenv.config();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @title Configuration Manager
 * @author Regav-AI Team
 * @notice Centralized configuration management with validation and type safety
 * @dev Handles environment-specific settings, validates configurations, and provides type-safe access
 */
class ConfigManager {
  constructor () {
    this.config = {};
    this.validationSchema = this._createValidationSchema();
    this._loadConfiguration();
    this._validateConfiguration();
  }

  // ============ Core Configuration Loading ============

  /**
     * @notice Load and parse all configuration from environment variables and files
     * @dev Combines environment variables with file-based configurations
     */
  _loadConfiguration () {
    // General application settings
    this.config.app = {
      name: process.env.APP_NAME || 'scalping-ai-agent',
      env: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT) || 3000,
      logLevel: process.env.LOG_LEVEL || 'info',
      isDevelopment: process.env.NODE_ENV === 'development',
      isProduction: process.env.NODE_ENV === 'production'
    };

    // Recall network configuration
    this.config.recall = {
      apiKey: process.env.RECALL_API_KEY || process.env.RECALL_PRIVATE_KEY,
      network: process.env.RECALL_NETWORK || 'testnet',
      baseUrl: process.env.RECALL_BASE_URL || 'https://api.sandbox.competitions.recall.network',
      competitionId: process.env.RECALL_COMPETITION_ID,
      agentName: process.env.RECALL_AGENT_NAME || 'RegavAI-Scalping-Agent',
      competitionDuration: parseInt(process.env.COMPETITION_DURATION_MINUTES) || 60,
      autoRegister: process.env.COMPETITION_AUTO_REGISTER === 'true',
      metricsInterval: parseInt(process.env.SUBMIT_METRICS_INTERVAL_SECONDS) || 30
    };

    // Vincent (Lit Protocol) configuration
    this.config.vincent = {
      appId: process.env.VINCENT_APP_ID,
      appVersion: parseInt(process.env.VINCENT_APP_VERSION) || 1,
      delegateeWalletName: process.env.VINCENT_DELEGATEE_WALLET_NAME || 'vincent-delegatee',
      maxTradeAmount: parseFloat(process.env.VINCENT_MAX_TRADE_AMOUNT) || 1000,
      tradeExpiryMinutes: parseInt(process.env.VINCENT_TRADE_EXPIRY_MINUTES) || 10,
      dailySpendingLimit: parseFloat(process.env.VINCENT_DAILY_SPENDING_LIMIT) || 5000,
      litNetwork: process.env.LIT_NETWORK || 'cayenne',
      capacityCreditTokenId: process.env.LIT_CAPACITY_CREDIT_TOKEN_ID
    };

    // Gaia AI network configuration
    this.config.gaia = {
      apiKey: process.env.GAIA_API_KEY,
      baseUrl: process.env.GAIA_NODE_URL || 'https://llama3b.gaia.domains/v1',
      model: process.env.GAIA_MODEL || 'llama3b',
      embeddingModel: process.env.GAIA_EMBEDDING_MODEL || 'nomic-embed',
      sentimentNodeUrl: process.env.GAIA_SENTIMENT_NODE_URL,
      marketAnalysisNodeUrl: process.env.GAIA_MARKET_ANALYSIS_NODE_URL
    };

    // Wallet and security configuration
    this.config.wallet = {
      name: process.env.WALLET_NAME || 'arbWallet',
      passwordFile: process.env.WALLET_PASSWORD_FILE || '/Users/pc/regav-ai/.wallet-password',
      useEncrypted: process.env.VINCENT_DELEGATEE_PRIVATE_KEY_ENCRYPTED !== 'false' // Default to true
    };

    // Trading strategy configuration
    this.config.trading = {
      maxPositionSizeUsd: parseFloat(process.env.MAX_POSITION_SIZE_USD) || 1000,
      maxTradesPerHour: parseInt(process.env.MAX_TRADES_PER_HOUR) || 50,
      minProfitThreshold: parseFloat(process.env.MIN_PROFIT_THRESHOLD) || 0.005,
      stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 0.003,
      takeProfitPercentage: parseFloat(process.env.TAKE_PROFIT_PERCENTAGE) || 0.01,

      // Technical indicators
      rsi: {
        period: parseInt(process.env.RSI_PERIOD) || 14,
        oversold: parseInt(process.env.RSI_OVERSOLD) || 30,
        overbought: parseInt(process.env.RSI_OVERBOUGHT) || 70
      },
      macd: {
        fast: parseInt(process.env.MACD_FAST) || 12,
        slow: parseInt(process.env.MACD_SLOW) || 26,
        signal: parseInt(process.env.MACD_SIGNAL) || 9
      },
      volume: {
        maPeriod: parseInt(process.env.VOLUME_MA_PERIOD) || 5,
        minMultiplier: parseFloat(process.env.MIN_VOLUME_MULTIPLIER) || 1.2
      },

      // Trading pairs
      pairs: (process.env.TRADING_PAIRS || 'BTC/USDT,ETH/USDT').split(',').map(pair => pair.trim()),
      primaryPair: process.env.PRIMARY_TRADING_PAIR || 'BTC/USDT'
    };

    // Blockchain network configurations
    this.config.networks = {
      ethereum: {
        rpcUrl: process.env.ETHEREUM_RPC_URL,
        chainId: parseInt(process.env.ETHEREUM_CHAIN_ID) || 1
      },
      arbitrum: {
        rpcUrl: process.env.ARBITRUM_RPC_URL,
        chainId: parseInt(process.env.ARBITRUM_CHAIN_ID) || 42161
      },
      optimism: {
        rpcUrl: process.env.OPTIMISM_RPC_URL,
        chainId: parseInt(process.env.OPTIMISM_CHAIN_ID) || 10
      },
      base: {
        rpcUrl: process.env.BASE_RPC_URL,
        chainId: parseInt(process.env.BASE_CHAIN_ID) || 8453
      },
      solana: {
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        cluster: process.env.SOLANA_CLUSTER || 'mainnet-beta'
      }
    };

    // Market data provider configurations
    this.config.marketData = {
      coinGecko: {
        apiKey: process.env.COINGECKO_API_KEY
      },
      coinMarketCap: {
        apiKey: process.env.COINMARKETCAP_API_KEY
      },
      alphaVantage: {
        apiKey: process.env.ALPHAVANTAGE_API_KEY
      }
    };

    // Social sentiment data sources
    this.config.sentiment = {
      twitter: {
        bearerToken: process.env.TWITTER_BEARER_TOKEN,
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET
      },
      reddit: {
        clientId: process.env.REDDIT_CLIENT_ID,
        clientSecret: process.env.REDDIT_CLIENT_SECRET
      }
    };

    // Monitoring and alerting
    this.config.monitoring = {
      enableDashboard: process.env.ENABLE_MONITORING_DASHBOARD === 'true',
      dashboardPort: parseInt(process.env.DASHBOARD_PORT) || 3001,
      dashboardAuth: {
        username: process.env.DASHBOARD_USERNAME || 'admin',
        password: process.env.DASHBOARD_PASSWORD
      },
      webhook: {
        url: process.env.WEBHOOK_URL,
        secret: process.env.WEBHOOK_SECRET
      },
      telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID
      },
      discord: {
        webhookUrl: process.env.DISCORD_WEBHOOK_URL
      }
    };

    // Security configuration
    this.config.security = {
      jwt: {
        secret: process.env.JWT_SECRET,
        expiry: process.env.JWT_EXPIRY || '24h'
      },
      rateLimit: {
        windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
        maxRequests: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 100
      },
      https: {
        enabled: process.env.ENABLE_HTTPS === 'true',
        certPath: process.env.SSL_CERT_PATH,
        keyPath: process.env.SSL_KEY_PATH
      }
    };

    // Redis configuration for caching and job queues
    this.config.redis = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0
    };

    // Database configuration
    this.config.database = {
      url: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true'
    };

    // Development and testing configuration
    this.config.development = {
      testMode: process.env.TEST_MODE === 'true',
      simulationMode: process.env.SIMULATION_MODE === 'true',
      paperTrading: process.env.ENABLE_PAPER_TRADING === 'true',
      debug: {
        trades: process.env.DEBUG_TRADES === 'true',
        sentiment: process.env.DEBUG_SENTIMENT === 'true',
        technicalAnalysis: process.env.DEBUG_TECHNICAL_ANALYSIS === 'true',
        verbose: process.env.VERBOSE_LOGGING === 'true'
      },
      backtest: {
        startDate: process.env.BACKTEST_START_DATE || '2024-01-01',
        endDate: process.env.BACKTEST_END_DATE || '2024-12-31',
        initialBalance: parseFloat(process.env.BACKTEST_INITIAL_BALANCE) || 10000
      }
    };

    // Performance optimization settings
    this.config.performance = {
      maxMemoryMb: parseInt(process.env.MAX_MEMORY_USAGE_MB) || 512,
      enableGcOptimization: process.env.ENABLE_GARBAGE_COLLECTION_OPTIMIZATION === 'true',
      enableClustering: process.env.ENABLE_CLUSTERING === 'true',
      clusterWorkers: parseInt(process.env.CLUSTER_WORKERS) || 2,
      cache: {
        enablePriceCache: process.env.ENABLE_PRICE_CACHE === 'true',
        priceCacheTtl: parseInt(process.env.PRICE_CACHE_TTL_SECONDS) || 5,
        enableSentimentCache: process.env.ENABLE_SENTIMENT_CACHE === 'true',
        sentimentCacheTtl: parseInt(process.env.SENTIMENT_CACHE_TTL_SECONDS) || 60
      }
    };

    // Emergency and safety settings
    this.config.safety = {
      emergencyStopEnabled: process.env.EMERGENCY_STOP_ENABLED === 'true',
      maxLossPercentage: parseFloat(process.env.MAX_LOSS_PERCENTAGE) || 10,
      circuitBreakerThreshold: parseFloat(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5
    };

    // Load additional file-based configurations
    this._loadFileConfigurations();
  }

  // ============ File-based Configuration Loading ============

  /**
     * @notice Load additional configurations from JSON files
     * @dev Loads trading parameters, network configs, and indicator settings from files
     */
  _loadFileConfigurations () {
    const configDir = join(__dirname, '../../config');

    // Load trading strategy parameters
    try {
      const tradingConfigPath = join(configDir, 'trading.json');
      if (existsSync(tradingConfigPath)) {
        const tradingConfig = JSON.parse(readFileSync(tradingConfigPath, 'utf8'));
        this.config.trading = { ...this.config.trading, ...tradingConfig };
      }
    } catch (error) {
      logger.warn('Could not load trading.json configuration:', error.message);
    }

    // Load network configurations
    try {
      const networksConfigPath = join(configDir, 'networks.json');
      if (existsSync(networksConfigPath)) {
        const networksConfig = JSON.parse(readFileSync(networksConfigPath, 'utf8'));
        this.config.networks = { ...this.config.networks, ...networksConfig };
      }
    } catch (error) {
      logger.warn('Could not load networks.json configuration:', error.message);
    }

    // Load technical indicators configuration
    try {
      const indicatorsConfigPath = join(configDir, 'indicators.json');
      if (existsSync(indicatorsConfigPath)) {
        const indicatorsConfig = JSON.parse(readFileSync(indicatorsConfigPath, 'utf8'));
        this.config.trading = {
          ...this.config.trading,
          indicators: { ...this.config.trading, ...indicatorsConfig }
        };
      }
    } catch (error) {
      logger.warn('Could not load indicators.json configuration:', error.message);
    }
  }

  // ============ Configuration Validation ============

  /**
     * @notice Create Joi validation schema for configuration
     * @dev Defines validation rules for all configuration sections
     * @return {Joi.ObjectSchema} Complete validation schema
     */
  _createValidationSchema () {
    return Joi.object({
      app: Joi.object({
        name: Joi.string().required(),
        env: Joi.string().valid('development', 'production', 'test').required(),
        port: Joi.number().port().required(),
        logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').required(),
        isDevelopment: Joi.boolean().required(),
        isProduction: Joi.boolean().required()
      }).required(),

      recall: Joi.object({
        apiKey: Joi.string().allow('', null),
        network: Joi.string().valid('testnet', 'mainnet').required(),
        baseUrl: Joi.string().uri().required(),
        competitionId: Joi.string().allow('', null),
        agentName: Joi.string().required(),
        competitionDuration: Joi.number().min(1).max(1440).required(), // 1 minute to 24 hours
        autoRegister: Joi.boolean().required(),
        metricsInterval: Joi.number().min(1).max(300).required() // 1 second to 5 minutes
      }).required(),

      vincent: Joi.object({
        appId: Joi.string().required(),
        appVersion: Joi.number().positive().required(),
        delegateeWalletName: Joi.string().required(),
        maxTradeAmount: Joi.number().positive().required(),
        tradeExpiryMinutes: Joi.number().positive().max(60).required(),
        dailySpendingLimit: Joi.number().positive().required(),
        litNetwork: Joi.string().required(),
        capacityCreditTokenId: Joi.string().allow('', null)
      }).required(),

      gaia: Joi.object({
        apiKey: Joi.string().required(),
        baseUrl: Joi.string().uri().required(),
        model: Joi.string().required(),
        embeddingModel: Joi.string().required(),
        sentimentNodeUrl: Joi.string().uri().allow(null),
        marketAnalysisNodeUrl: Joi.string().uri().allow(null)
      }).required(),

      trading: Joi.object({
        maxPositionSizeUsd: Joi.number().positive().required(),
        maxTradesPerHour: Joi.number().positive().max(1000).required(),
        minProfitThreshold: Joi.number().positive().max(1).required(), // Max 100%
        stopLossPercentage: Joi.number().positive().max(0.5).required(), // Max 50%
        takeProfitPercentage: Joi.number().positive().max(1).required(), // Max 100%
        rsi: Joi.object({
          period: Joi.number().positive().required(),
          oversold: Joi.number().min(0).max(50).required(),
          overbought: Joi.number().min(50).max(100).required()
        }).required(),
        macd: Joi.object({
          fast: Joi.number().positive().required(),
          slow: Joi.number().positive().required(),
          signal: Joi.number().positive().required()
        }).required(),
        volume: Joi.object({
          maPeriod: Joi.number().positive().required(),
          minMultiplier: Joi.number().positive().required()
        }).required(),
        pairs: Joi.array().items(Joi.string()).min(1).required(),
        primaryPair: Joi.string().required()
      }).required(),

      security: Joi.object({
        jwt: Joi.object({
          secret: Joi.string().min(32).allow('', null),
          expiry: Joi.string().allow('', null)
        }).optional(),
        rateLimit: Joi.object({
          windowMs: Joi.number().positive().required(),
          maxRequests: Joi.number().positive().required()
        }).required()
      }).required(),

      safety: Joi.object({
        emergencyStopEnabled: Joi.boolean().required(),
        maxLossPercentage: Joi.number().positive().max(100).required(),
        circuitBreakerThreshold: Joi.number().positive().max(50).required()
      }).required()
    });
  }

  /**
     * @notice Validate the loaded configuration against the schema
     * @dev Throws error if configuration is invalid
     */
  _validateConfiguration () {
    const { error, value } = this.validationSchema.validate(this.config, {
      allowUnknown: true, // Allow additional properties not in schema
      stripUnknown: false // Keep unknown properties
    });

    if (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }

    // Update config with validated values
    this.config = value;
  }

  // ============ Public Access Methods ============

  /**
     * @notice Get configuration for a specific section
     * @param {string} section Configuration section name
     * @return {object} Configuration section
     */
  get (section) {
    if (!section) {
      return this.config;
    }

    const keys = section.split('.');
    let result = this.config;

    for (const key of keys) {
      if (result[key] === undefined) {
        throw new Error(`Configuration section '${section}' not found`);
      }
      result = result[key];
    }

    return result;
  }

  /**
     * @notice Get application configuration
     * @return {object} Application configuration
     */
  getAppConfig () {
    return this.get('app');
  }

  /**
     * @notice Get Recall network configuration
     * @return {object} Recall configuration
     */
  getRecallConfig () {
    return this.get('recall');
  }

  /**
     * @notice Get Vincent (Lit Protocol) configuration
     * @return {object} Vincent configuration
     */
  getVincentConfig () {
    return this.get('vincent');
  }

  /**
     * @notice Get Gaia AI network configuration
     * @return {object} Gaia configuration
     */
  getGaiaConfig () {
    return this.get('gaia');
  }

  /**
     * @notice Get trading strategy configuration
     * @return {object} Trading configuration
     */
  getTradingConfig () {
    return this.get('trading');
  }

  /**
     * @notice Get blockchain networks configuration
     * @return {object} Networks configuration
     */
  getNetworksConfig () {
    return this.get('networks');
  }

  /**
     * @notice Get security configuration
     * @return {object} Security configuration
     */
  getSecurityConfig () {
    return this.get('security');
  }

  /**
     * @notice Get monitoring configuration
     * @return {object} Monitoring configuration
     */
  getMonitoringConfig () {
    return this.get('monitoring');
  }

  /**
     * @notice Get safety and emergency configuration
     * @return {object} Safety configuration
     */
  getSafetyConfig () {
    return this.get('safety');
  }

  /**
     * @notice Check if running in development mode
     * @return {boolean} True if in development mode
     */
  isDevelopment () {
    return this.config.app.isDevelopment;
  }

  /**
     * @notice Check if running in production mode
     * @return {boolean} True if in production mode
     */
  isProduction () {
    return this.config.app.isProduction;
  }

  /**
     * @notice Check if test mode is enabled
     * @return {boolean} True if test mode is enabled
     */
  isTestMode () {
    return this.config.development?.testMode || false;
  }

  /**
     * @notice Check if simulation mode is enabled
     * @return {boolean} True if simulation mode is enabled
     */
  isSimulationMode () {
    return this.config.development?.simulationMode || false;
  }

  /**
     * @notice Get wallet configuration with security considerations
     * @return {object} Wallet configuration (sensitive data excluded)
     */
  getWalletConfig () {
    const walletConfig = this.get('wallet');
    // Return safe configuration without exposing sensitive data
    return {
      name: walletConfig.name,
      useEncrypted: walletConfig.useEncrypted
      // Don't return password file path or other sensitive info
    };
  }

  // ============ Configuration Updates ============

  /**
     * @notice Update a configuration value (runtime only)
     * @param {string} path Configuration path (e.g., 'trading.maxPositionSizeUsd')
     * @param {any} value New value
     * @dev This only updates the runtime configuration, not the environment
     */
  set (path, value) {
    const keys = path.split('.');
    let target = this.config;

    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]]) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }

    // Set the value
    target[keys[keys.length - 1]] = value;

    // Re-validate configuration after update
    this._validateConfiguration();
  }

  /**
     * @notice Get configuration summary for logging (excludes sensitive data)
     * @return {object} Safe configuration summary
     */
  getSafeConfigSummary () {
    return {
      app: this.config.app,
      recall: {
        network: this.config.recall.network,
        baseUrl: this.config.recall.baseUrl,
        agentName: this.config.recall.agentName
      },
      trading: {
        maxPositionSizeUsd: this.config.trading.maxPositionSizeUsd,
        maxTradesPerHour: this.config.trading.maxTradesPerHour,
        pairs: this.config.trading.pairs,
        primaryPair: this.config.trading.primaryPair
      },
      safety: this.config.safety
      // Exclude sensitive configuration like API keys, secrets, etc.
    };
  }
}

// Create and export singleton instance
const configManager = new ConfigManager();
export default configManager;
