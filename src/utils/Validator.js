// ============ Imports ============
import Joi from 'joi';
import { ethers } from 'ethers';
import config from './Config.js';
import logger from './Logger.js';

// ============ Constants ============
const TRADING_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDC', 'XRP/USDT', 'WETH/USDC', 'DOGE/USDT', 'WIF/USDT', 'SHIB/USDT'];
const SUPPORTED_CHAINS = ['ethereum', 'arbitrum', 'optimism', 'base', 'solana'];
const SUPPORTED_TIMEFRAMES = ['1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1d'];
const MIN_TRADE_AMOUNT = 1; // Minimum $1 USD
const MAX_TRADE_AMOUNT = 10000; // Maximum $10,000 USD per trade
const MIN_CONFIDENCE_SCORE = 0; // 0%
const MAX_CONFIDENCE_SCORE = 1; // 100%

// ============ Custom Joi Extensions ============

/**
 * @notice Custom Joi extension for Ethereum addresses
 */
const ethereumAddressExtension = {
  type: 'ethereumAddress',
  base: Joi.string(),
  messages: {
    'ethereumAddress.invalid': 'Invalid Ethereum address format'
  },
  validate (value, helpers) {
    if (!ethers.utils.isAddress(value)) {
      return { value, errors: helpers.error('ethereumAddress.invalid') };
    }
    return { value: ethers.utils.getAddress(value) }; // Return checksummed address
  }
};

/**
 * @notice Custom Joi extension for trading pairs
 */
const tradingPairExtension = {
  type: 'tradingPair',
  base: Joi.string(),
  messages: {
    'tradingPair.invalid': 'Invalid trading pair format (expected format: TOKEN/TOKEN)',
    'tradingPair.unsupported': 'Unsupported trading pair'
  },
  validate (value, helpers) {
    // Check format
    if (!/^[A-Z]+\/[A-Z]+$/.test(value)) {
      return { value, errors: helpers.error('tradingPair.invalid') };
    }

    // Check if supported
    if (!TRADING_PAIRS.includes(value)) {
      return { value, errors: helpers.error('tradingPair.unsupported') };
    }

    return { value };
  }
};

/**
 * @notice Custom Joi extension for percentage values
 */
const percentageExtension = {
  type: 'percentage',
  base: Joi.number(),
  messages: {
    'percentage.outOfRange': 'Percentage must be between 0 and 100'
  },
  validate (value, helpers) {
    if (value < 0 || value > 100) {
      return { value, errors: helpers.error('percentage.outOfRange') };
    }
    return { value };
  }
};

// Extend Joi with custom types
const extendedJoi = Joi.extend(ethereumAddressExtension, tradingPairExtension, percentageExtension);

/**
 * @title Input Validation Utilities
 * @author Zoll - Regav-AI Team
 * @notice Comprehensive validation utilities for trading agent inputs and configurations
 * @dev Provides type-safe validation for trading parameters, blockchain data, and API inputs
 */
class Validators {
  constructor () {
    this.joi = extendedJoi;
    this.logger = logger;
    this._initializeSchemas();
  }

  // ============ Schema Initialization ============

  /**
     * @notice Initialize all validation schemas
     * @dev Creates reusable schemas for different data types
     */
  _initializeSchemas () {
    // Trading-related schemas
    this.schemas = {
      // Basic trade parameters
      tradeParams: this.joi.object({
        pair: this.joi.tradingPair().required(),
        action: this.joi.string().valid('BUY', 'SELL', 'HOLD').required(),
        amount: this.joi.number().min(MIN_TRADE_AMOUNT).max(MAX_TRADE_AMOUNT).required(),
        price: this.joi.number().positive().optional(),
        stopLoss: this.joi.number().positive().optional(),
        takeProfit: this.joi.number().positive().optional(),
        timeframe: this.joi.string().valid(...SUPPORTED_TIMEFRAMES).default('1m'),
        confidence: this.joi.number().min(MIN_CONFIDENCE_SCORE).max(MAX_CONFIDENCE_SCORE).optional(),
        strategy: this.joi.string().max(50).optional(),
        metadata: this.joi.object().optional()
      }),

      // Trade signal validation
      tradeSignal: this.joi.object({
        pair: this.joi.tradingPair().required(),
        signal: this.joi.string().valid('BUY', 'SELL', 'HOLD').required(),
        strength: this.joi.number().min(0).max(1).required(),
        confidence: this.joi.number().min(MIN_CONFIDENCE_SCORE).max(MAX_CONFIDENCE_SCORE).required(),
        indicators: this.joi.object({
          rsi: this.joi.number().min(0).max(100).optional(),
          macd: this.joi.object({
            line: this.joi.number().optional(),
            signal: this.joi.number().optional(),
            histogram: this.joi.number().optional()
          }).optional(),
          bollingerBands: this.joi.object({
            upper: this.joi.number().positive().optional(),
            middle: this.joi.number().positive().optional(),
            lower: this.joi.number().positive().optional(),
            position: this.joi.number().min(0).max(1).optional()
          }).optional(),
          volume: this.joi.object({
            current: this.joi.number().positive().optional(),
            average: this.joi.number().positive().optional(),
            spike: this.joi.number().positive().optional()
          }).optional()
        }).optional(),
        sentiment: this.joi.object({
          score: this.joi.number().min(-1).max(1).optional(),
          confidence: this.joi.number().min(0).max(1).optional(),
          source: this.joi.string().valid('twitter', 'reddit', 'news', 'gaia').optional()
        }).optional(),
        timestamp: this.joi.date().timestamp().default(Date.now),
        expiresAt: this.joi.date().timestamp().optional()
      }),

      // Market data validation
      marketData: this.joi.object({
        pair: this.joi.tradingPair().required(),
        price: this.joi.number().positive().required(),
        volume: this.joi.number().min(0).required(),
        high24h: this.joi.number().positive().optional(),
        low24h: this.joi.number().positive().optional(),
        change24h: this.joi.number().optional(),
        changePercent24h: this.joi.percentage().optional(),
        timestamp: this.joi.date().timestamp().default(Date.now),
        source: this.joi.string().max(50).optional()
      }),

      // Blockchain transaction validation
      transaction: this.joi.object({
        hash: this.joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
        from: this.joi.ethereumAddress().required(),
        to: this.joi.ethereumAddress().required(),
        value: this.joi.string().pattern(/^[0-9]+$/).required(), // Wei amount as string
        gasLimit: this.joi.number().positive().required(),
        gasPrice: this.joi.string().pattern(/^[0-9]+$/).optional(), // Wei as string
        maxFeePerGas: this.joi.string().pattern(/^[0-9]+$/).optional(),
        maxPriorityFeePerGas: this.joi.string().pattern(/^[0-9]+$/).optional(),
        nonce: this.joi.number().min(0).required(),
        chainId: this.joi.number().positive().required(),
        data: this.joi.string().pattern(/^0x[a-fA-F0-9]*$/).optional().default('0x')
      }),

      // Vincent permission validation
      vincentPermission: this.joi.object({
        toolId: this.joi.string().required(),
        userId: this.joi.ethereumAddress().required(),
        action: this.joi.string().valid('ALLOW', 'DENY').required(),
        amount: this.joi.number().positive().optional(),
        expiry: this.joi.date().timestamp().optional(),
        conditions: this.joi.object({
          maxAmount: this.joi.number().positive().optional(),
          dailyLimit: this.joi.number().positive().optional(),
          allowedTokens: this.joi.array().items(this.joi.ethereumAddress()).optional(),
          allowedChains: this.joi.array().items(this.joi.string().valid(...SUPPORTED_CHAINS)).optional(),
          timeRestrictions: this.joi.object({
            startTime: this.joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(), // HH:MM format
            endTime: this.joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
            timezone: this.joi.string().optional()
          }).optional()
        }).optional(),
        metadata: this.joi.object().optional()
      }),

      // Gaia AI inference validation
      gaiaInference: this.joi.object({
        model: this.joi.string().required(),
        prompt: this.joi.string().min(1).max(10000).required(),
        maxTokens: this.joi.number().positive().max(4000).optional(),
        temperature: this.joi.number().min(0).max(2).optional(),
        topP: this.joi.number().min(0).max(1).optional(),
        stream: this.joi.boolean().default(false),
        metadata: this.joi.object({
          requestId: this.joi.string().optional(),
          userId: this.joi.string().optional(),
          category: this.joi.string().valid('sentiment', 'market_analysis', 'signal_generation').optional()
        }).optional()
      }),

      // Recall competition validation
      recallCompetition: this.joi.object({
        competitionId: this.joi.string().required(),
        agentId: this.joi.string().required(),
        portfolioValue: this.joi.number().positive().required(),
        totalTrades: this.joi.number().min(0).required(),
        winningTrades: this.joi.number().min(0).required(),
        pnl: this.joi.number().required(), // Can be negative
        winRate: this.joi.percentage().optional(),
        maxDrawdown: this.joi.percentage().optional(),
        sharpeRatio: this.joi.number().optional(),
        timestamp: this.joi.date().timestamp().default(Date.now)
      }),

      // API request validation
      apiRequest: this.joi.object({
        endpoint: this.joi.string().uri().required(),
        method: this.joi.string().valid('GET', 'POST', 'PUT', 'DELETE', 'PATCH').default('GET'),
        headers: this.joi.object().pattern(this.joi.string(), this.joi.string()).optional(),
        body: this.joi.alternatives().try(
          this.joi.object(),
          this.joi.array(),
          this.joi.string()
        ).optional(),
        timeout: this.joi.number().positive().max(30000).default(10000), // Max 30 seconds
        retries: this.joi.number().min(0).max(5).default(3)
      }),

      // Configuration update validation
      configUpdate: this.joi.object({
        section: this.joi.string().valid(
          'trading', 'safety', 'performance', 'monitoring'
        ).required(),
        key: this.joi.string().required(),
        value: this.joi.alternatives().try(
          this.joi.string(),
          this.joi.number(),
          this.joi.boolean(),
          this.joi.object(),
          this.joi.array()
        ).required(),
        reason: this.joi.string().max(200).optional()
      }),

      // Performance metrics validation
      performanceMetrics: this.joi.object({
        operation: this.joi.string().required(),
        duration: this.joi.number().positive().required(),
        success: this.joi.boolean().required(),
        errorCount: this.joi.number().min(0).default(0),
        memoryUsage: this.joi.object({
          rss: this.joi.number().positive().required(),
          heapTotal: this.joi.number().positive().required(),
          heapUsed: this.joi.number().positive().required(),
          external: this.joi.number().positive().required()
        }).optional(),
        customMetrics: this.joi.object().optional()
      })
    };
  }

  // ============ Core Validation Methods ============

  /**
     * @notice Validate data against a specific schema
     * @param {string} schemaName Name of the schema to use
     * @param {any} data Data to validate
     * @param {object} options Validation options
     * @return {object} Validation result with value or error
     */
  validate (schemaName, data, options = {}) {
    try {
      const schema = this.schemas[schemaName];
      if (!schema) {
        throw new Error(`Schema '${schemaName}' not found`);
      }

      const validationOptions = {
        abortEarly: false, // Return all errors
        allowUnknown: false, // Don't allow unknown fields
        stripUnknown: true, // Remove unknown fields
        ...options
      };

      const result = schema.validate(data, validationOptions);

      if (result.error) {
        this.logger.warn('Validation failed', {
          schema: schemaName,
          errors: result.error.details.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            value: err.context?.value
          }))
        });

        return {
          success: false,
          error: result.error,
          errors: result.error.details,
          data: null
        };
      }

      return {
        success: true,
        error: null,
        errors: [],
        data: result.value
      };
    } catch (error) {
      this.logger.error('Validation error', { schemaName, error: error.message });
      return {
        success: false,
        error,
        errors: [{ message: error.message }],
        data: null
      };
    }
  }

  /**
     * @notice Validate and throw error if validation fails
     * @param {string} schemaName Name of the schema to use
     * @param {any} data Data to validate
     * @param {object} options Validation options
     * @return {any} Validated and cleaned data
     * @throws {Error} If validation fails
     */
  validateAndThrow (schemaName, data, options = {}) {
    const result = this.validate(schemaName, data, options);

    if (!result.success) {
      const errorMessage = result.errors
        .map(err => `${err.path?.join('.') || 'root'}: ${err.message}`)
        .join('; ');
      throw new Error(`Validation failed for ${schemaName}: ${errorMessage}`);
    }

    return result.data;
  }

  // ============ Specialized Validation Methods ============

  /**
     * @notice Validate trading parameters
     * @param {object} tradeParams Trading parameters
     * @return {object} Validation result
     */
  validateTradeParams (tradeParams) {
    const result = this.validate('tradeParams', tradeParams);

    // Additional business logic validation
    if (result.success) {
      const data = result.data;

      // Validate stop loss and take profit levels
      if (data.stopLoss && data.takeProfit && data.price) {
        if (data.action === 'BUY') {
          if (data.stopLoss >= data.price) {
            return this._createValidationError('Stop loss must be below entry price for BUY orders');
          }
          if (data.takeProfit <= data.price) {
            return this._createValidationError('Take profit must be above entry price for BUY orders');
          }
        } else if (data.action === 'SELL') {
          if (data.stopLoss <= data.price) {
            return this._createValidationError('Stop loss must be above entry price for SELL orders');
          }
          if (data.takeProfit >= data.price) {
            return this._createValidationError('Take profit must be below entry price for SELL orders');
          }
        }
      }

      // Validate trading hours (if configured)
      if (!this._isValidTradingTime()) {
        return this._createValidationError('Trading is not allowed during current time period');
      }
    }

    return result;
  }

  /**
     * @notice Validate trade signal data
     * @param {object} signalData Trading signal data
     * @return {object} Validation result
     */
  validateTradeSignal (signalData) {
    const result = this.validate('tradeSignal', signalData);

    if (result.success) {
      const data = result.data;

      // Validate signal expiry
      if (data.expiresAt && data.expiresAt <= Date.now()) {
        return this._createValidationError('Trade signal has expired');
      }

      // Validate confidence vs strength correlation
      if (data.confidence < 0.3 && data.strength > 0.7) {
        this.logger.warn('Signal has high strength but low confidence', {
          pair: data.pair,
          strength: data.strength,
          confidence: data.confidence
        });
      }
    }

    return result;
  }

  /**
     * @notice Validate Ethereum address
     * @param {string} address Ethereum address to validate
     * @return {object} Validation result with checksummed address
     */
  validateEthereumAddress (address) {
    try {
      if (!address || typeof address !== 'string') {
        return this._createValidationError('Address must be a non-empty string');
      }

      if (!ethers.utils.isAddress(address)) {
        return this._createValidationError('Invalid Ethereum address format');
      }

      return {
        success: true,
        error: null,
        errors: [],
        data: ethers.utils.getAddress(address) // Return checksummed address
      };
    } catch (error) {
      return this._createValidationError(`Address validation failed: ${error.message}`);
    }
  }

  /**
     * @notice Validate trading pair format and support
     * @param {string} pair Trading pair (e.g., 'BTC/USDT')
     * @return {object} Validation result
     */
  validateTradingPair (pair) {
    return this.validate('tradingPair', pair);
  }

  /**
     * @notice Validate percentage value (0-100)
     * @param {number} percentage Percentage value
     * @return {object} Validation result
     */
  validatePercentage (percentage) {
    return this.validate('percentage', percentage);
  }

  /**
     * @notice Validate blockchain transaction data
     * @param {object} txData Transaction data
     * @return {object} Validation result
     */
  validateTransaction (txData) {
    const result = this.validate('transaction', txData);

    if (result.success) {
      const data = result.data;

      // Additional validation for gas settings
      if (data.gasPrice && (data.maxFeePerGas || data.maxPriorityFeePerGas)) {
        return this._createValidationError('Cannot specify both legacy gasPrice and EIP-1559 gas fields');
      }

      // Validate chain ID matches supported networks
      const supportedChainIds = [1, 10, 42161, 8453]; // Ethereum, Optimism, Arbitrum, Base
      if (!supportedChainIds.includes(data.chainId)) {
        return this._createValidationError(`Unsupported chain ID: ${data.chainId}`);
      }
    }

    return result;
  }

  /**
     * @notice Validate Vincent permission parameters
     * @param {object} permissionData Permission data
     * @return {object} Validation result
     */
  validateVincentPermission (permissionData) {
    const result = this.validate('vincentPermission', permissionData);

    if (result.success) {
      const data = result.data;

      // Validate permission expiry
      if (data.expiry && data.expiry <= Date.now()) {
        return this._createValidationError('Permission expiry time is in the past');
      }

      // Validate daily limit vs max amount
      if (data.conditions?.dailyLimit && data.conditions?.maxAmount) {
        if (data.conditions.dailyLimit < data.conditions.maxAmount) {
          return this._createValidationError('Daily limit cannot be less than max amount per transaction');
        }
      }
    }

    return result;
  }

  // ============ Utility Methods ============

  /**
     * @notice Check if current time is within valid trading hours
     * @return {boolean} True if trading is allowed
     * @dev This would check against configured trading hours
     */
  _isValidTradingTime () {
    // In a real implementation, this would check against configured trading hours
    // For now, assume trading is always allowed
    // const tradingConfig = config.getTradingConfig(); // Unused for now

    // Check if emergency stop is enabled
    const safetyConfig = config.getSafetyConfig();
    if (safetyConfig.emergencyStopEnabled) {
      return false;
    }

    return true;
  }

  /**
     * @notice Create a standardized validation error response
     * @param {string} message Error message
     * @return {object} Error response object
     */
  _createValidationError (message) {
    return {
      success: false,
      error: new Error(message),
      errors: [{ message }],
      data: null
    };
  }

  /**
     * @notice Sanitize input data by removing potentially dangerous fields
     * @param {any} data Input data to sanitize
     * @return {any} Sanitized data
     */
  sanitizeInput (data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized = Array.isArray(data) ? [] : {};
    const dangerousFields = ['__proto__', 'constructor', 'prototype'];

    for (const key in data) {
      if (dangerousFields.includes(key)) {
        continue; // Skip dangerous fields
      }

      if (typeof data[key] === 'object' && data[key] !== null) {
        sanitized[key] = this.sanitizeInput(data[key]);
      } else {
        sanitized[key] = data[key];
      }
    }

    return sanitized;
  }

  /**
     * @notice Validate and sanitize API request parameters
     * @param {object} requestData API request data
     * @return {object} Validation result with sanitized data
     */
  validateApiRequest (requestData) {
    // First sanitize the input
    const sanitizedData = this.sanitizeInput(requestData);

    // Then validate
    const result = this.validate('apiRequest', sanitizedData);

    if (result.success) {
      // Additional security validation
      const data = result.data;

      // Check for suspicious URLs
      if (this._isSuspiciousUrl(data.endpoint)) {
        return this._createValidationError('Suspicious URL detected');
      }

      // Validate headers for potential security issues
      if (data.headers) {
        for (const [key, value] of Object.entries(data.headers)) {
          if (this._isSuspiciousHeader(key, value)) {
            return this._createValidationError(`Suspicious header detected: ${key}`);
          }
        }
      }
    }

    return result;
  }

  /**
     * @notice Check if URL is potentially suspicious
     * @param {string} url URL to check
     * @return {boolean} True if URL is suspicious
     */
  _isSuspiciousUrl (url) {
    try {
      const parsedUrl = new URL(url);

      // Check for localhost/private IPs in production
      if (config.isProduction()) {
        const hostname = parsedUrl.hostname;
        if (hostname === 'localhost' ||
                    hostname.startsWith('127.') ||
                    hostname.startsWith('192.168.') ||
                    hostname.startsWith('10.') ||
                    hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) {
          return true;
        }
      }

      // Check for non-standard ports
      const port = parsedUrl.port;
      if (port && !['80', '443', '8080', '3000'].includes(port)) {
        return true;
      }

      return false;
    } catch (error) {
      return true; // Invalid URL is suspicious
    }
  }

  /**
     * @notice Check if header is potentially suspicious
     * @param {string} key Header key
     * @param {string} value Header value
     * @return {boolean} True if header is suspicious
     */
  _isSuspiciousHeader (key, value) {
    const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'x-remote-addr'];
    if (suspiciousHeaders.includes(key.toLowerCase())) {
      return true;
    }

    // Check for potential script injection in headers
    if (value && /<script|javascript:|data:/.test(value.toLowerCase())) {
      return true;
    }

    return false;
  }

  // ============ Batch Validation Methods ============

  /**
     * @notice Validate multiple trade signals at once
     * @param {Array} signals Array of trade signals
     * @return {object} Batch validation result
     */
  validateTradeSignalsBatch (signals) {
    if (!Array.isArray(signals)) {
      return this._createValidationError('Signals must be an array');
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < signals.length; i++) {
      const result = this.validateTradeSignal(signals[i]);
      results.push({
        index: i,
        ...result
      });

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    return {
      success: errorCount === 0,
      totalSignals: signals.length,
      successCount,
      errorCount,
      results
    };
  }

  /**
     * @notice Get validation schema for a specific type
     * @param {string} schemaName Schema name
     * @return {object} Joi schema object
     */
  getSchema (schemaName) {
    return this.schemas[schemaName] || null;
  }

  /**
     * @notice Get list of available schemas
     * @return {Array} Array of schema names
     */
  getAvailableSchemas () {
    return Object.keys(this.schemas);
  }

  /**
     * @notice Create a custom validation schema on the fly
     * @param {object} schemaDefinition Joi schema definition
     * @param {string} name Optional name for the schema
     * @return {object} Joi schema object
     */
  createCustomSchema (schemaDefinition, name = null) {
    const schema = this.joi.object(schemaDefinition);

    if (name) {
      this.schemas[name] = schema;
    }

    return schema;
  }

  /**
     * @notice Validate environment configuration
     * @param {object} envConfig Environment configuration
     * @return {object} Validation result
     */
  validateEnvironmentConfig (envConfig) {
    const envSchema = this.joi.object({
      NODE_ENV: this.joi.string().valid('development', 'production', 'test').required(),
      RECALL_API_KEY: this.joi.string().min(10).required(),
      VINCENT_APP_ID: this.joi.string().required(),
      GAIA_API_KEY: this.joi.string().min(10).required(),
      LOG_LEVEL: this.joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
      PORT: this.joi.number().port().default(3000)
    });

    return this.validate('custom', envConfig, { schema: envSchema });
  }

  /**
     * @notice Get validation statistics
     * @return {object} Validation statistics
     */
  getValidationStats () {
    return {
      availableSchemas: this.getAvailableSchemas().length,
      customExtensions: ['ethereumAddress', 'tradingPair', 'percentage'],
      supportedChains: SUPPORTED_CHAINS,
      supportedTradingPairs: TRADING_PAIRS,
      supportedTimeframes: SUPPORTED_TIMEFRAMES,
      limits: {
        minTradeAmount: MIN_TRADE_AMOUNT,
        maxTradeAmount: MAX_TRADE_AMOUNT,
        minConfidence: MIN_CONFIDENCE_SCORE,
        maxConfidence: MAX_CONFIDENCE_SCORE
      }
    };
  }
}

// Create and export singleton instance
const validators = new Validators();
export default validators;
