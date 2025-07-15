// ============ Imports ============
import winston, { format } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import config from './Config.js';

// ============ Custom Log Formats ============

/**
 * @notice Custom timestamp format for consistent logging
 */
const timestampFormat = format.timestamp({
  format: 'YYYY-MM-DD HH:mm:ss.SSS'
});

/**
 * @notice Custom format for trade-related logs
 */
const tradeLogFormat = format.printf(({ timestamp, level, message, tradeId, pair, action, amount, price, meta, ...rest }) => {
  let logMessage = `${timestamp} [${level.toUpperCase()}]`;

  // Add trade-specific information if available
  if (tradeId) logMessage += ` [TRADE:${tradeId}]`;
  if (pair) logMessage += ` [${pair}]`;
  if (action) logMessage += ` [${action.toUpperCase()}]`;

  logMessage += ` ${message}`;

  // Add trade details if available
  if (amount) logMessage += ` | Amount: ${amount}`;
  if (price) logMessage += ` | Price: ${price}`;

  // Add metadata if present
  if (meta && Object.keys(meta).length > 0) {
    logMessage += ` | Meta: ${JSON.stringify(meta)}`;
  }

  // Add any additional fields
  const additionalFields = Object.keys(rest);
  if (additionalFields.length > 0) {
    const extras = additionalFields.map(key => `${key}: ${rest[key]}`).join(', ');
    logMessage += ` | ${extras}`;
  }

  return logMessage;
});

/**
 * @notice Custom format for sentiment analysis logs
 */
const sentimentLogFormat = format.printf(({ timestamp, level, message, source, sentiment, confidence, symbol, ...rest }) => {
  let logMessage = `${timestamp} [${level.toUpperCase()}] [SENTIMENT]`;

  if (symbol) logMessage += ` [${symbol}]`;
  if (source) logMessage += ` [${source.toUpperCase()}]`;

  logMessage += ` ${message}`;

  // Add sentiment details
  if (sentiment !== undefined) logMessage += ` | Sentiment: ${sentiment}`;
  if (confidence !== undefined) logMessage += ` | Confidence: ${confidence}`;

  // Add any additional fields
  const additionalFields = Object.keys(rest);
  if (additionalFields.length > 0) {
    const extras = additionalFields.map(key => `${key}: ${rest[key]}`).join(', ');
    logMessage += ` | ${extras}`;
  }

  return logMessage;
});

/**
 * @notice Custom format for performance monitoring logs
 */
const performanceLogFormat = format.printf(({ timestamp, level, message, operation, duration, memoryUsage, ...rest }) => {
  let logMessage = `${timestamp} [${level.toUpperCase()}] [PERF]`;

  if (operation) logMessage += ` [${operation}]`;

  logMessage += ` ${message}`;

  // Add performance metrics
  if (duration !== undefined) logMessage += ` | Duration: ${duration}ms`;
  if (memoryUsage) logMessage += ` | Memory: ${JSON.stringify(memoryUsage)}`;

  // Add any additional fields
  const additionalFields = Object.keys(rest);
  if (additionalFields.length > 0) {
    const extras = additionalFields.map(key => `${key}: ${rest[key]}`).join(', ');
    logMessage += ` | ${extras}`;
  }

  return logMessage;
});

/**
 * @title Advanced Logging System
 * @author Zoll - Regav-AI Team
 * @notice Comprehensive logging system for trading agent with multiple log types and destinations
 * @dev Supports structured logging, log rotation, and specialized log formats for different components
 */
class Logger {
  constructor () {
    this.logDir = join(process.cwd(), 'logs');
    this.ensureLogDirectory();
    this.loggers = {};
    this.initializeLoggers();
  }

  // ============ Logger Initialization ============

  /**
     * @notice Ensure log directory exists
     * @dev Creates log directory structure if it doesn't exist
     */
  ensureLogDirectory () {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    // Create subdirectories for different log types
    const subDirs = ['trades', 'sentiment', 'performance', 'errors', 'system'];
    subDirs.forEach(dir => {
      const fullPath = join(this.logDir, dir);
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  /**
     * @notice Initialize all logger instances
     * @dev Creates specialized loggers for different components
     */
  initializeLoggers () {
    // Use lazy config access to avoid circular dependency
    let logLevel = 'info';
    let isProduction = false;
    try {
      if (config) {
        logLevel = config.get('app.logLevel');
        isProduction = config.isProduction();
      }
    } catch (error) {
      // Use defaults if config not available
      logLevel = process.env.LOG_LEVEL || 'info';
      isProduction = process.env.NODE_ENV === 'production';
    }

    // Main application logger
    this.loggers.main = this.createMainLogger(logLevel, isProduction);

    // Trading-specific logger
    this.loggers.trading = this.createTradingLogger(logLevel);

    // Sentiment analysis logger
    this.loggers.sentiment = this.createSentimentLogger(logLevel);

    // Performance monitoring logger
    this.loggers.performance = this.createPerformanceLogger(logLevel);

    // Error logger with enhanced error tracking
    this.loggers.error = this.createErrorLogger();

    // System events logger
    this.loggers.system = this.createSystemLogger(logLevel);
  }

  /**
     * @notice Create main application logger
     * @param {string} logLevel Log level configuration
     * @param {boolean} isProduction Production environment flag
     * @return {winston.Logger} Configured main logger
     */
  createMainLogger (logLevel, isProduction) {
    const transports = [];

    // Console transport for development
    if (!isProduction) {
      transports.push(new winston.transports.Console({
        level: logLevel,
        format: format.combine(
          format.colorize(),
          timestampFormat,
          format.simple()
        )
      }));
    }

    // File transport with rotation
    transports.push(new DailyRotateFile({
      filename: join(this.logDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: logLevel,
      format: format.combine(
        timestampFormat,
        format.json()
      )
    }));

    return winston.createLogger({
      level: logLevel,
      format: format.combine(
        timestampFormat,
        format.errors({ stack: true }),
        format.json()
      ),
      transports,
      exitOnError: false
    });
  }

  /**
     * @notice Create trading-specific logger
     * @param {string} logLevel Log level configuration
     * @return {winston.Logger} Configured trading logger
     */
  createTradingLogger (logLevel) {
    return winston.createLogger({
      level: logLevel,
      format: format.combine(
        timestampFormat,
        tradeLogFormat
      ),
      transports: [
        new DailyRotateFile({
          filename: join(this.logDir, 'trades', 'trades-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '30d',
          level: logLevel
        }),
        new DailyRotateFile({
          filename: join(this.logDir, 'trades', 'trades-%DATE%.json'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '30d',
          level: logLevel,
          format: format.combine(
            timestampFormat,
            format.json()
          )
        })
      ]
    });
  }

  /**
     * @notice Create sentiment analysis logger
     * @param {string} logLevel Log level configuration
     * @return {winston.Logger} Configured sentiment logger
     */
  createSentimentLogger (logLevel) {
    return winston.createLogger({
      level: logLevel,
      format: format.combine(
        timestampFormat,
        sentimentLogFormat
      ),
      transports: [
        new DailyRotateFile({
          filename: join(this.logDir, 'sentiment', 'sentiment-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          level: logLevel
        }),
        new DailyRotateFile({
          filename: join(this.logDir, 'sentiment', 'sentiment-%DATE%.json'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          level: logLevel,
          format: format.combine(
            timestampFormat,
            format.json()
          )
        })
      ]
    });
  }

  /**
     * @notice Create performance monitoring logger
     * @param {string} logLevel Log level configuration
     * @return {winston.Logger} Configured performance logger
     */
  createPerformanceLogger (logLevel) {
    return winston.createLogger({
      level: logLevel,
      format: format.combine(
        timestampFormat,
        performanceLogFormat
      ),
      transports: [
        new DailyRotateFile({
          filename: join(this.logDir, 'performance', 'performance-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '7d',
          level: logLevel
        }),
        new DailyRotateFile({
          filename: join(this.logDir, 'performance', 'performance-%DATE%.json'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '7d',
          level: logLevel,
          format: format.combine(
            timestampFormat,
            format.json()
          )
        })
      ]
    });
  }

  /**
     * @notice Create error logger with enhanced error tracking
     * @return {winston.Logger} Configured error logger
     */
  createErrorLogger () {
    return winston.createLogger({
      level: 'error',
      format: format.combine(
        timestampFormat,
        format.errors({ stack: true }),
        format.json()
      ),
      transports: [
        new DailyRotateFile({
          filename: join(this.logDir, 'errors', 'errors-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '10m',
          maxFiles: '30d',
          level: 'error'
        })
      ]
    });
  }

  /**
     * @notice Create system events logger
     * @param {string} logLevel Log level configuration
     * @return {winston.Logger} Configured system logger
     */
  createSystemLogger (logLevel) {
    return winston.createLogger({
      level: logLevel,
      format: format.combine(
        timestampFormat,
        format.json()
      ),
      transports: [
        new DailyRotateFile({
          filename: join(this.logDir, 'system', 'system-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '10m',
          maxFiles: '14d',
          level: logLevel
        })
      ]
    });
  }

  // ============ Public Logging Methods ============

  /**
     * @notice Log general application messages
     * @param {string} level Log level (info, warn, error, debug)
     * @param {string} message Log message
     * @param {object} meta Additional metadata
     */
  log (level, message, meta = {}) {
    this.loggers.main.log(level, message, meta);
  }

  /**
     * @notice Log info messages
     * @param {string} message Log message
     * @param {object} meta Additional metadata
     */
  info (message, meta = {}) {
    this.loggers.main.info(message, meta);
  }

  /**
     * @notice Log warning messages
     * @param {string} message Log message
     * @param {object} meta Additional metadata
     */
  warn (message, meta = {}) {
    this.loggers.main.warn(message, meta);
  }

  /**
     * @notice Log error messages
     * @param {string} message Log message
     * @param {Error|object} error Error object or additional metadata
     */
  error (message, error = {}) {
    const errorMeta = error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...error
        }
      : error;

    this.loggers.main.error(message, errorMeta);
    this.loggers.error.error(message, errorMeta);
  }

  /**
     * @notice Log debug messages
     * @param {string} message Log message
     * @param {object} meta Additional metadata
     */
  debug (message, meta = {}) {
    this.loggers.main.debug(message, meta);
  }

  // ============ Specialized Logging Methods ============

  /**
     * @notice Log trading-related activities
     * @param {string} level Log level
     * @param {string} message Log message
     * @param {object} tradeData Trade-specific data
     */
  logTrade (level, message, tradeData = {}) {
    const {
      tradeId,
      pair,
      action, // 'BUY', 'SELL', 'CANCEL', etc.
      amount,
      price,
      fee,
      profit,
      loss,
      strategy,
      executionTime,
      ...meta
    } = tradeData;

    this.loggers.trading.log(level, message, {
      tradeId,
      pair,
      action,
      amount,
      price,
      fee,
      profit,
      loss,
      strategy,
      executionTime,
      meta: Object.keys(meta).length > 0 ? meta : undefined
    });
  }

  /**
     * @notice Log successful trade execution
     * @param {object} tradeData Trade execution data
     */
  logTradeSuccess (tradeData) {
    this.logTrade('info', 'Trade executed successfully', {
      ...tradeData,
      status: 'SUCCESS'
    });
  }

  /**
     * @notice Log failed trade execution
     * @param {object} tradeData Trade execution data
     * @param {string|Error} error Error details
     */
  logTradeFailure (tradeData, error) {
    const errorMessage = error instanceof Error ? error.message : error;
    this.logTrade('error', `Trade execution failed: ${errorMessage}`, {
      ...tradeData,
      status: 'FAILED',
      error: errorMessage
    });
  }

  /**
     * @notice Log trade signal generation
     * @param {object} signalData Trading signal data
     */
  logTradeSignal (signalData) {
    const {
      pair,
      signal, // 'BUY', 'SELL', 'HOLD'
      strength,
      indicators,
      sentiment,
      price,
      timestamp
    } = signalData;

    this.logTrade('info', `Trade signal generated: ${signal}`, {
      pair,
      action: 'SIGNAL',
      signal,
      strength,
      indicators,
      sentiment,
      price,
      timestamp
    });
  }

  /**
     * @notice Log sentiment analysis results
     * @param {string} message Log message
     * @param {object} sentimentData Sentiment analysis data
     */
  logSentiment (message, sentimentData = {}) {
    const {
      symbol,
      source, // 'twitter', 'reddit', 'news', 'gaia'
      sentiment, // numeric score -1 to 1
      confidence, // 0 to 1
      dataPoints,
      analysisTime,
      ...meta
    } = sentimentData;

    this.loggers.sentiment.info(message, {
      symbol,
      source,
      sentiment,
      confidence,
      dataPoints,
      analysisTime,
      ...meta
    });
  }

  /**
     * @notice Log performance metrics
     * @param {string} operation Operation name
     * @param {number} duration Operation duration in milliseconds
     * @param {object} additionalMetrics Additional performance data
     */
  logPerformance (operation, duration, additionalMetrics = {}) {
    const memoryUsage = process.memoryUsage();
    const {
      success = true,
      errorCount = 0,
      throughput,
      latency,
      ...meta
    } = additionalMetrics;

    this.loggers.performance.info(`Operation completed: ${operation}`, {
      operation,
      duration,
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      success,
      errorCount,
      throughput,
      latency,
      ...meta
    });
  }

  /**
     * @notice Log system events (startup, shutdown, configuration changes)
     * @param {string} event Event type
     * @param {string} message Event message
     * @param {object} eventData Additional event data
     */
  logSystemEvent (event, message, eventData = {}) {
    this.loggers.system.info(message, {
      event,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      ...eventData
    });
  }

  /**
     * @notice Log Vincent permission operations
     * @param {string} operation Vincent operation type
     * @param {object} permissionData Permission-related data
     */
  logVincentOperation (operation, permissionData = {}) {
    const {
      toolId,
      policyName,
      result, // 'ALLOWED', 'DENIED'
      reason,
      spentAmount,
      remainingLimit,
      userId,
      ...meta
    } = permissionData;

    this.loggers.system.info(`Vincent operation: ${operation}`, {
      component: 'VINCENT',
      operation,
      toolId,
      policyName,
      result,
      reason,
      spentAmount,
      remainingLimit,
      userId,
      ...meta
    });
  }

  /**
     * @notice Log Gaia AI inference operations
     * @param {string} operation Gaia operation type
     * @param {object} inferenceData AI inference data
     */
  logGaiaInference (operation, inferenceData = {}) {
    const {
      model,
      prompt,
      response,
      processingTime,
      tokensUsed,
      cost,
      success,
      ...meta
    } = inferenceData;

    this.loggers.system.info(`Gaia AI operation: ${operation}`, {
      component: 'GAIA',
      operation,
      model,
      promptLength: prompt?.length,
      responseLength: response?.length,
      processingTime,
      tokensUsed,
      cost,
      success,
      ...meta
    });
  }

  /**
     * @notice Log Recall competition operations
     * @param {string} operation Recall operation type
     * @param {object} competitionData Competition-related data
     */
  logRecallOperation (operation, competitionData = {}) {
    const {
      competitionId,
      rank,
      totalParticipants,
      portfolioValue,
      pnl,
      totalTrades,
      winRate,
      ...meta
    } = competitionData;

    this.loggers.system.info(`Recall operation: ${operation}`, {
      component: 'RECALL',
      operation,
      competitionId,
      rank,
      totalParticipants,
      portfolioValue,
      pnl,
      totalTrades,
      winRate,
      ...meta
    });
  }

  // ============ Utility Methods ============

  /**
     * @notice Create a performance timer for measuring operation duration
     * @param {string} operation Operation name
     * @return {function} Timer function to call when operation completes
     */
  createPerformanceTimer (operation) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    return (additionalMetrics = {}) => {
      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();

      const memoryDelta = {
        rss: endMemory.rss - startMemory.rss,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external
      };

      this.logPerformance(operation, duration, {
        ...additionalMetrics,
        memoryDelta
      });

      return duration;
    };
  }

  /**
     * @notice Create a trade session logger for tracking related trade operations
     * @param {string} sessionId Unique session identifier
     * @return {object} Session logger with bound session ID
     */
  createTradeSession (sessionId) {
    return {
      logSignal: (signalData) => this.logTradeSignal({ ...signalData, sessionId }),
      logExecution: (tradeData) => this.logTradeSuccess({ ...tradeData, sessionId }),
      logFailure: (tradeData, error) => this.logTradeFailure({ ...tradeData, sessionId }, error),
      logMetrics: (metrics) => this.logTrade('info', 'Session metrics', {
        sessionId,
        action: 'METRICS',
        ...metrics
      }),
      end: (summary) => this.logTrade('info', 'Trade session ended', {
        sessionId,
        action: 'SESSION_END',
        ...summary
      })
    };
  }

  /**
     * @notice Log application startup information
     * @param {object} startupData Application startup data
     */
  logStartup (startupData = {}) {
    const {
      version,
      environment,
      configSummary,
      enabledFeatures = [],
      ...meta
    } = startupData;

    this.logSystemEvent('STARTUP', 'Application starting up', {
      version,
      environment,
      configSummary,
      enabledFeatures,
      startupTime: new Date().toISOString(),
      ...meta
    });

    this.info('🚀 Scalping AI Agent starting up', {
      version,
      environment,
      features: enabledFeatures.join(', ')
    });
  }

  /**
     * @notice Log application shutdown information
     * @param {object} shutdownData Application shutdown data
     */
  logShutdown (shutdownData = {}) {
    const {
      reason = 'NORMAL',
      uptime,
      totalTrades = 0,
      finalPortfolioValue,
      totalProfit,
      ...meta
    } = shutdownData;

    this.logSystemEvent('SHUTDOWN', 'Application shutting down', {
      reason,
      uptime,
      totalTrades,
      finalPortfolioValue,
      totalProfit,
      shutdownTime: new Date().toISOString(),
      ...meta
    });

    this.info('🛑 Scalping AI Agent shutting down', {
      reason,
      uptime: `${Math.round(uptime / 1000)}s`,
      totalTrades,
      performance: { finalPortfolioValue, totalProfit }
    });
  }

  /**
     * @notice Log critical errors that require immediate attention
     * @param {string} message Critical error message
     * @param {Error|object} error Error details
     * @param {object} context Additional context
     */
  logCritical (message, error, context = {}) {
    const criticalData = {
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      context,
      ...(error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        : error)
    };

    // Log to multiple destinations for critical errors
    this.loggers.main.error(`🚨 CRITICAL: ${message}`, criticalData);
    this.loggers.error.error(`CRITICAL: ${message}`, criticalData);
    this.loggers.system.error(`CRITICAL SYSTEM ERROR: ${message}`, criticalData);

    // In production, this could trigger additional alerting mechanisms
    if (config.isProduction()) {
      this.triggerCriticalAlert(message, criticalData);
    }
  }

  /**
     * @notice Trigger critical alert mechanisms (webhook, telegram, etc.)
     * @param {string} message Alert message
     * @param {object} data Alert data
     * @dev This would integrate with external alerting systems in production
     */
  triggerCriticalAlert (message, data) {
    // Implementation would depend on configured alerting systems
    // Could include webhook calls, Telegram notifications, etc.
    console.error('🚨 CRITICAL ALERT:', message, data);
  }

  /**
     * @notice Get logger statistics and health information
     * @return {object} Logger health and statistics
     */
  getLoggerHealth () {
    const stats = {
      logDirectory: this.logDir,
      activeLoggers: Object.keys(this.loggers),
      logLevel: config.get('app.logLevel'),
      logRotation: {
        enabled: true,
        maxSize: '20m',
        retention: '14d'
      }
    };

    return stats;
  }
}

// Create and export singleton instance
const logger = new Logger();

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.logCritical('Uncaught Exception', error, {
    processExit: true,
    pid: process.pid
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.logCritical('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason : new Error(reason),
    promise: promise.toString()
  }, {
    processExit: false,
    pid: process.pid
  });
});

export default logger;
