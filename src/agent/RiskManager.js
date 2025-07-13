// ============ Imports ============
import { EventEmitter } from 'events';
import Logger from '../utils/Logger.js';

// ============ Constants ============
const RISK_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

const RISK_EVENTS = {
  POSITION_SIZE_EXCEEDED: 'POSITION_SIZE_EXCEEDED',
  DRAWDOWN_LIMIT_EXCEEDED: 'DRAWDOWN_LIMIT_EXCEEDED',
  DAILY_LOSS_LIMIT_EXCEEDED: 'DAILY_LOSS_LIMIT_EXCEEDED',
  CORRELATION_RISK_HIGH: 'CORRELATION_RISK_HIGH',
  VOLATILITY_SPIKE: 'VOLATILITY_SPIKE',
  LIQUIDITY_RISK: 'LIQUIDITY_RISK'
};

const DEFAULT_RISK_PARAMS = {
  maxDrawdown: 4.5, // Maximum drawdown percentage - aggressive for 1-hour competition
  maxPositionSize: 0.20, // Maximum position size as % of portfolio - hyper-aggressive
  stopLossPercent: 0.15, // Stop loss percentage - very tight for 1-hour scalping
  takeProfitPercent: 0.35, // Take profit percentage - quick profits in 1 hour
  maxConcurrentTrades: 12, // Maximum number of concurrent positions - maximum activity
  maxDailyLoss: 5.0, // Maximum hourly loss percentage - higher for 1-hour window
  maxCorrelation: 0.7, // Maximum correlation between positions - allow more correlation
  minLiquidity: 30000, // Minimum liquidity threshold (USD) - lower for speed
  volatilityThreshold: 0.15 // Maximum volatility threshold - embrace volatility for profits
};

/**
 * @title RiskManager
 * @notice Comprehensive risk management system for scalping trading agent
 * @dev Implements real-time risk monitoring, position sizing, and emergency controls
 */
export class RiskManager extends EventEmitter {
  constructor (config = {}) {
    super();

    // ============ Risk Configuration ============
    this.config = {
      ...DEFAULT_RISK_PARAMS,
      ...config
    };

    // ============ Core Dependencies ============
    this.logger = Logger.createMainLogger('info', false);

    // ============ Risk State Tracking ============
    this.portfolioValue = 0;
    this.startingBalance = 0;
    this.currentDrawdown = 0;
    this.maxDrawdownReached = 0;
    this.dailyPnL = 0;
    this.dailyStartBalance = 0;

    // ============ Position Tracking ============
    this.activePositions = new Map(); // positionId -> position data
    this.positionHistory = [];
    this.correlationMatrix = new Map();

    // ============ Risk Metrics ============
    this.riskMetrics = {
      currentRiskLevel: RISK_LEVELS.LOW,
      riskScore: 0,
      lastUpdate: Date.now(),
      alerts: [],
      volatilityProfile: new Map(), // pair -> volatility data
      liquidityProfile: new Map() // pair -> liquidity data
    };

    // ============ Emergency Controls ============
    this.emergencyStop = false;
    this.riskLimitsBreached = new Set();

    // ============ Performance Tracking ============
    this.performanceMetrics = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxConsecutiveLosses: 0,
      currentConsecutiveLosses: 0
    };

    this.logger.info('RiskManager initialized', {
      maxDrawdown: this.config.maxDrawdown,
      maxPositionSize: this.config.maxPositionSize,
      maxConcurrentTrades: this.config.maxConcurrentTrades
    });

    // ============ Setup Monitoring ============
    this._setupRiskMonitoring();
  }

  // ============ Core Risk Assessment ============

  /**
     * @notice Evaluate if a new position can be opened based on risk parameters
     * @param {string} pair - Trading pair
     * @param {Object} signal - Trading signal with confidence and indicators
     * @returns {boolean} Whether position can be safely opened
     */
  canOpenPosition (pair, signal) {
    try {
      // ============ Emergency Stop Check ============
      if (this.emergencyStop) {
        this.logger.warn('Emergency stop active - blocking new positions');
        return false;
      }

      // ============ Maximum Concurrent Trades Check ============
      if (this.activePositions.size >= this.config.maxConcurrentTrades) {
        this.logger.debug('Maximum concurrent trades reached', {
          current: this.activePositions.size,
          max: this.config.maxConcurrentTrades
        });
        return false;
      }

      // ============ Drawdown Check ============
      if (this.currentDrawdown >= this.config.maxDrawdown) {
        this._emitRiskEvent(RISK_EVENTS.DRAWDOWN_LIMIT_EXCEEDED, {
          current: this.currentDrawdown,
          limit: this.config.maxDrawdown
        });
        return false;
      }

      // ============ Daily Loss Limit Check ============
      const dailyLossPercent = (this.dailyPnL / this.dailyStartBalance) * 100;
      if (dailyLossPercent <= -this.config.maxDailyLoss) {
        this._emitRiskEvent(RISK_EVENTS.DAILY_LOSS_LIMIT_EXCEEDED, {
          current: dailyLossPercent,
          limit: this.config.maxDailyLoss
        });
        return false;
      }

      // ============ Signal Confidence Check ============
      if (signal.confidence < 0.6) {
        this.logger.debug('Signal confidence too low', {
          confidence: signal.confidence,
          required: 0.6
        });
        return false;
      }

      // ============ Volatility Check ============
      const volatility = this._getVolatility(pair);
      if (volatility > this.config.volatilityThreshold) {
        this._emitRiskEvent(RISK_EVENTS.VOLATILITY_SPIKE, {
          pair,
          volatility,
          threshold: this.config.volatilityThreshold
        });
        return false;
      }

      // ============ Liquidity Check ============
      const liquidity = this._getLiquidity(pair);
      if (liquidity < this.config.minLiquidity) {
        this._emitRiskEvent(RISK_EVENTS.LIQUIDITY_RISK, {
          pair,
          liquidity,
          minimum: this.config.minLiquidity
        });
        return false;
      }

      // ============ Correlation Check ============
      if (!this._checkCorrelationRisk(pair)) {
        this._emitRiskEvent(RISK_EVENTS.CORRELATION_RISK_HIGH, {
          pair,
          maxCorrelation: this.config.maxCorrelation
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error in canOpenPosition', { error: error.message });
      return false; // Fail safe
    }
  }

  /**
     * @notice Validate if a trade meets all risk management criteria
     * @param {Object} tradeParams - Trade parameters to validate
     * @param {string} tradeParams.pair - Trading pair
     * @param {string} tradeParams.action - BUY or SELL
     * @param {number} tradeParams.amount - Trade amount
     * @param {number} tradeParams.price - Trade price
     * @returns {Object} Validation result with approval status and reason
     */
  async validateTrade (tradeParams) {
    try {
      const { pair, action, amount, price } = tradeParams;

      // ============ Basic Parameter Validation ============
      if (!pair || !action || !amount || !price) {
        return {
          approved: false,
          reason: 'Missing required trade parameters',
          riskLevel: RISK_LEVELS.HIGH
        };
      }

      // ============ Emergency Stop Check ============
      if (this.emergencyStop) {
        return {
          approved: false,
          reason: 'Emergency stop active',
          riskLevel: RISK_LEVELS.CRITICAL
        };
      }

      // ============ Position Size Validation ============
      const tradeValue = amount * price;
      if (tradeValue > this.config.maxPositionSize * this.portfolioValue) {
        return {
          approved: false,
          reason: `Trade size exceeds maximum position limit: $${tradeValue.toFixed(2)} > $${(this.config.maxPositionSize * this.portfolioValue).toFixed(2)}`,
          riskLevel: RISK_LEVELS.HIGH
        };
      }

      // ============ Daily Loss Limit Check ============
      if (this.dailyPnL < -this.config.maxDailyLoss) {
        return {
          approved: false,
          reason: 'Daily loss limit exceeded',
          riskLevel: RISK_LEVELS.CRITICAL
        };
      }

      // ============ Concurrent Trades Check ============
      if (action === 'BUY' && this.activePositions.size >= this.config.maxConcurrentTrades) {
        return {
          approved: false,
          reason: 'Maximum concurrent trades limit reached',
          riskLevel: RISK_LEVELS.MEDIUM
        };
      }

      // ============ Drawdown Check ============
      if (this.currentDrawdown >= this.config.maxDrawdown) {
        return {
          approved: false,
          reason: 'Maximum drawdown limit exceeded',
          riskLevel: RISK_LEVELS.CRITICAL
        };
      }

      // ============ Volatility Risk Assessment ============
      const volatility = this._getVolatility(pair);
      if (volatility > this.config.volatilityThreshold) {
        return {
          approved: false,
          reason: 'Market volatility too high for safe trading',
          riskLevel: RISK_LEVELS.HIGH
        };
      }

      // ============ Liquidity Check ============
      const liquidity = this._getLiquidity(pair);
      if (liquidity < this.config.minLiquidity) {
        return {
          approved: false,
          reason: 'Insufficient market liquidity',
          riskLevel: RISK_LEVELS.HIGH
        };
      }

      // ============ Calculate Risk Score ============
      const riskScore = this._calculateTradeRiskScore(tradeParams);
      let riskLevel = RISK_LEVELS.LOW;

      if (riskScore > 0.8) {
        riskLevel = RISK_LEVELS.CRITICAL;
      } else if (riskScore > 0.6) {
        riskLevel = RISK_LEVELS.HIGH;
      } else if (riskScore > 0.4) {
        riskLevel = RISK_LEVELS.MEDIUM;
      }

      // ============ Final Approval Decision ============
      const approved = riskScore < 0.7; // Approve if risk score is below 70%

      this.logger.info('Trade validation completed', {
        pair,
        action,
        amount,
        riskScore: riskScore.toFixed(3),
        riskLevel,
        approved
      });

      return {
        approved,
        reason: approved ? 'Trade passes all risk checks' : 'Risk score too high',
        riskLevel,
        riskScore,
        details: {
          volatility,
          liquidity,
          tradeValue,
          currentDrawdown: this.currentDrawdown,
          activePositions: this.activePositions.size
        }
      };
    } catch (error) {
      this.logger.error('Error validating trade', { error: error.message });
      return {
        approved: false,
        reason: 'Risk validation error',
        riskLevel: RISK_LEVELS.CRITICAL
      };
    }
  }

  /**
     * @notice Calculate optimal position size based on risk parameters
     * @param {string} pair - Trading pair
     * @param {number} baseSize - Base position size
     * @param {Object} marketData - Current market data
     * @returns {number} Adjusted position size
     */
  adjustPositionSize (pair, baseSize, _marketData) {
    try {
      let adjustedSize = baseSize;

      // ============ Portfolio Percentage Limit ============
      const maxAllowedSize = this.portfolioValue * this.config.maxPositionSize;
      adjustedSize = Math.min(adjustedSize, maxAllowedSize);

      // ============ Volatility Adjustment ============
      const volatility = this._getVolatility(pair);
      const volatilityMultiplier = Math.max(0.3, 1 - (volatility / this.config.volatilityThreshold));
      adjustedSize *= volatilityMultiplier;

      // ============ Drawdown Adjustment ============
      const drawdownMultiplier = Math.max(0.5, 1 - (this.currentDrawdown / this.config.maxDrawdown));
      adjustedSize *= drawdownMultiplier;

      // ============ Consecutive Losses Adjustment ============
      if (this.performanceMetrics.currentConsecutiveLosses > 2) {
        const lossMultiplier = Math.max(0.3, 1 - (this.performanceMetrics.currentConsecutiveLosses * 0.1));
        adjustedSize *= lossMultiplier;
      }

      // ============ Ensure Minimum Size ============
      const minSize = this.portfolioValue * 0.01; // Minimum 1% of portfolio
      adjustedSize = Math.max(adjustedSize, minSize);

      this.logger.debug('Position size adjusted', {
        pair,
        originalSize: baseSize,
        adjustedSize,
        volatilityMultiplier,
        drawdownMultiplier
      });

      return adjustedSize;
    } catch (error) {
      this.logger.error('Error adjusting position size', { error: error.message });
      return baseSize * 0.5; // Conservative fallback
    }
  }

  /**
     * @notice Update portfolio value and risk metrics
     * @param {number} newValue - Current portfolio value
     */
  updatePortfolioValue (newValue) {
    try {
      const oldValue = this.portfolioValue;
      this.portfolioValue = newValue;

      // ============ Initialize Starting Balance ============
      if (this.startingBalance === 0) {
        this.startingBalance = newValue;
        this.dailyStartBalance = newValue;
      }

      // ============ Calculate Current Drawdown ============
      const highWaterMark = Math.max(this.startingBalance, this.portfolioValue);
      this.currentDrawdown = ((highWaterMark - this.portfolioValue) / highWaterMark) * 100;
      this.maxDrawdownReached = Math.max(this.maxDrawdownReached, this.currentDrawdown);

      // ============ Update Daily P&L ============
      this.dailyPnL = this.portfolioValue - this.dailyStartBalance;

      // ============ Update Risk Level ============
      this._updateRiskLevel();

      this.logger.debug('Portfolio value updated', {
        oldValue,
        newValue,
        drawdown: this.currentDrawdown,
        dailyPnL: this.dailyPnL
      });
    } catch (error) {
      this.logger.error('Error updating portfolio value', { error: error.message });
    }
  }

  // ============ Position Management ============

  /**
     * @notice Register a new position
     * @param {Object} position - Position data
     */
  registerPosition (position) {
    try {
      const positionId = `${position.pair}_${Date.now()}`;

      const positionData = {
        id: positionId,
        pair: position.pair,
        side: position.side,
        size: position.size,
        entryPrice: position.entryPrice,
        entryTime: Date.now(),
        stopLoss: position.entryPrice * (1 - this.config.stopLossPercent / 100),
        takeProfit: position.entryPrice * (1 + this.config.takeProfitPercent / 100),
        maxRisk: position.size * (this.config.stopLossPercent / 100),
        currentPnL: 0,
        maxPnL: 0,
        minPnL: 0
      };

      this.activePositions.set(positionId, positionData);

      this.logger.info('Position registered', {
        id: positionId,
        pair: position.pair,
        size: position.size,
        entryPrice: position.entryPrice
      });

      return positionId;
    } catch (error) {
      this.logger.error('Error registering position', { error: error.message });
      return null;
    }
  }

  /**
     * @notice Update existing position with current market data
     * @param {string} positionId - Position identifier
     * @param {number} currentPrice - Current market price
     */
  updatePosition (positionId, currentPrice) {
    try {
      const position = this.activePositions.get(positionId);
      if (!position) {
        this.logger.warn('Position not found for update', { positionId });
        return;
      }

      // ============ Calculate Current P&L ============
      const priceDiff = currentPrice - position.entryPrice;
      const sideMultiplier = position.side === 'BUY' ? 1 : -1;
      position.currentPnL = (priceDiff * sideMultiplier * position.size) / position.entryPrice * 100;

      // ============ Update Max/Min P&L ============
      position.maxPnL = Math.max(position.maxPnL, position.currentPnL);
      position.minPnL = Math.min(position.minPnL, position.currentPnL);

      // ============ Check Stop Loss/Take Profit ============
      const shouldClose = this._checkPositionExitConditions(position, currentPrice);

      if (shouldClose.exit) {
        this.emit('position_should_close', {
          positionId,
          reason: shouldClose.reason,
          currentPrice,
          pnl: position.currentPnL
        });
      }
    } catch (error) {
      this.logger.error('Error updating position', { positionId, error: error.message });
    }
  }

  /**
     * @notice Close and remove position from tracking
     * @param {string} positionId - Position identifier
     * @param {string} reason - Reason for closing
     * @param {number} exitPrice - Exit price
     */
  closePosition (positionId, reason, exitPrice) {
    try {
      const position = this.activePositions.get(positionId);
      if (!position) {
        this.logger.warn('Position not found for closing', { positionId });
        return;
      }

      // ============ Calculate Final P&L ============
      const priceDiff = exitPrice - position.entryPrice;
      const sideMultiplier = position.side === 'BUY' ? 1 : -1;
      const finalPnL = (priceDiff * sideMultiplier * position.size) / position.entryPrice * 100;

      // ============ Update Performance Metrics ============
      this._updatePerformanceMetrics(finalPnL, reason);

      // ============ Store Position History ============
      const closedPosition = {
        ...position,
        exitPrice,
        exitTime: Date.now(),
        finalPnL,
        reason,
        duration: Date.now() - position.entryTime
      };

      this.positionHistory.push(closedPosition);
      this.activePositions.delete(positionId);

      this.logger.info('Position closed', {
        id: positionId,
        pair: position.pair,
        finalPnL,
        reason,
        duration: closedPosition.duration
      });
    } catch (error) {
      this.logger.error('Error closing position', { positionId, error: error.message });
    }
  }

  // ============ Risk Monitoring ============

  /**
     * @notice Setup continuous risk monitoring
     * @dev Monitors risk metrics and triggers alerts
     */
  _setupRiskMonitoring () {
    // ============ Real-time Risk Assessment ============
    setInterval(() => {
      this._assessRealTimeRisk();
    }, 5000); // Every 5 seconds

    // ============ Daily Reset ============
    setInterval(() => {
      this._resetDailyMetrics();
    }, 24 * 60 * 60 * 1000); // Every 24 hours

    // ============ Risk Report Generation ============
    setInterval(() => {
      this._generateRiskReport();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
     * @notice Assess real-time risk across all positions
     * @dev Continuously monitors and updates risk levels
     */
  _assessRealTimeRisk () {
    try {
      let totalRisk = 0;
      let maxSinglePositionRisk = 0;

      // ============ Calculate Position Risks ============
      for (const [, position] of this.activePositions) {
        const positionRisk = Math.abs(position.currentPnL);
        totalRisk += positionRisk;
        maxSinglePositionRisk = Math.max(maxSinglePositionRisk, positionRisk);
      }

      // ============ Calculate Overall Risk Score ============
      this.riskMetrics.riskScore = this._calculateRiskScore(totalRisk, maxSinglePositionRisk);

      // ============ Update Risk Level ============
      this._updateRiskLevel();

      // ============ Check for Risk Limit Breaches ============
      this._checkRiskLimits();

      this.riskMetrics.lastUpdate = Date.now();
    } catch (error) {
      this.logger.error('Error in real-time risk assessment', { error: error.message });
    }
  }

  /**
     * @notice Update current risk level based on multiple factors
     * @dev Determines overall risk level from various metrics
     */
  _updateRiskLevel () {
    try {
      let riskLevel = RISK_LEVELS.LOW;

      // ============ Drawdown-based Risk ============
      if (this.currentDrawdown > this.config.maxDrawdown * 0.8) {
        riskLevel = RISK_LEVELS.CRITICAL;
      } else if (this.currentDrawdown > this.config.maxDrawdown * 0.6) {
        riskLevel = RISK_LEVELS.HIGH;
      } else if (this.currentDrawdown > this.config.maxDrawdown * 0.4) {
        riskLevel = RISK_LEVELS.MEDIUM;
      }

      // ============ Position Count Risk ============
      const positionRatio = this.activePositions.size / this.config.maxConcurrentTrades;
      if (positionRatio > 0.8) {
        riskLevel = this._escalateRiskLevel(riskLevel, RISK_LEVELS.MEDIUM);
      }

      // ============ Consecutive Losses Risk ============
      if (this.performanceMetrics.currentConsecutiveLosses > 3) {
        riskLevel = this._escalateRiskLevel(riskLevel, RISK_LEVELS.HIGH);
      }

      // ============ Daily Loss Risk ============
      const dailyLossPercent = Math.abs((this.dailyPnL / this.dailyStartBalance) * 100);
      if (dailyLossPercent > this.config.maxDailyLoss * 0.8) {
        riskLevel = this._escalateRiskLevel(riskLevel, RISK_LEVELS.HIGH);
      }

      // ============ Update Risk Level ============
      const oldLevel = this.riskMetrics.currentRiskLevel;
      this.riskMetrics.currentRiskLevel = riskLevel;

      if (oldLevel !== riskLevel) {
        this.logger.info('Risk level changed', { from: oldLevel, to: riskLevel });
        this.emit('risk_level_changed', { from: oldLevel, to: riskLevel });
      }
    } catch (error) {
      this.logger.error('Error updating risk level', { error: error.message });
    }
  }

  /**
     * @notice Check if any risk limits have been breached
     * @dev Monitors critical risk thresholds and triggers emergency actions
     */
  _checkRiskLimits () {
    try {
      const breaches = [];

      // ============ Check Drawdown Limit ============
      if (this.currentDrawdown >= this.config.maxDrawdown) {
        breaches.push({
          type: RISK_EVENTS.DRAWDOWN_LIMIT_EXCEEDED,
          current: this.currentDrawdown,
          limit: this.config.maxDrawdown
        });
      }

      // ============ Check Daily Loss Limit ============
      const dailyLossPercent = (this.dailyPnL / this.dailyStartBalance) * 100;
      if (dailyLossPercent <= -this.config.maxDailyLoss) {
        breaches.push({
          type: RISK_EVENTS.DAILY_LOSS_LIMIT_EXCEEDED,
          current: dailyLossPercent,
          limit: this.config.maxDailyLoss
        });
      }

      // ============ Process Breaches ============
      for (const breach of breaches) {
        if (!this.riskLimitsBreached.has(breach.type)) {
          this.riskLimitsBreached.add(breach.type);
          this._handleRiskBreach(breach);
        }
      }
    } catch (error) {
      this.logger.error('Error checking risk limits', { error: error.message });
    }
  }

  // ============ Utility Methods ============

  /**
     * @notice Get volatility for a trading pair
     * @param {string} pair - Trading pair
     * @returns {number} Volatility measure
     */
  _getVolatility (pair) {
    const volatilityData = this.riskMetrics.volatilityProfile.get(pair);
    return volatilityData ? volatilityData.current : 0.05; // Default 5%
  }

  /**
     * @notice Get liquidity for a trading pair
     * @param {string} pair - Trading pair
     * @returns {number} Liquidity measure in USD
     */
  _getLiquidity (pair) {
    const liquidityData = this.riskMetrics.liquidityProfile.get(pair);
    return liquidityData ? liquidityData.current : 1000000; // Default 1M USD
  }

  /**
     * @notice Check correlation risk between positions
     * @param {string} newPair - New trading pair to check
     * @returns {boolean} Whether correlation risk is acceptable
     */
  _checkCorrelationRisk (newPair) {
    try {
      for (const [, position] of this.activePositions) {
        const correlation = this._getCorrelation(position.pair, newPair);
        if (Math.abs(correlation) > this.config.maxCorrelation) {
          return false;
        }
      }
      return true;
    } catch (error) {
      this.logger.error('Error checking correlation risk', { error: error.message });
      return true; // Allow if calculation fails
    }
  }

  /**
     * @notice Get correlation between two trading pairs
     * @param {string} pair1 - First trading pair
     * @param {string} pair2 - Second trading pair
     * @returns {number} Correlation coefficient (-1 to 1)
     */
  _getCorrelation (pair1, pair2) {
    // Simplified correlation calculation
    // In production, this would use historical price data
    if (pair1 === pair2) return 1.0;

    const correlationKey = `${pair1}_${pair2}`;
    const storedCorrelation = this.correlationMatrix.get(correlationKey);

    return storedCorrelation || 0.3; // Default moderate correlation
  }

  /**
     * @notice Calculate overall risk score
     * @param {number} totalRisk - Total portfolio risk
     * @param {number} maxSingleRisk - Maximum single position risk
     * @returns {number} Risk score (0-100)
     */
  _calculateRiskScore (_totalRisk, _maxSingleRisk) {
    try {
      let score = 0;

      // ============ Drawdown Component (40% weight) ============
      score += (this.currentDrawdown / this.config.maxDrawdown) * 40;

      // ============ Position Risk Component (30% weight) ============
      const positionRiskRatio = this.activePositions.size / this.config.maxConcurrentTrades;
      score += positionRiskRatio * 30;

      // ============ Performance Component (20% weight) ============
      const consecutiveLossRatio = this.performanceMetrics.currentConsecutiveLosses / 5;
      score += Math.min(consecutiveLossRatio, 1) * 20;

      // ============ Daily Loss Component (10% weight) ============
      const dailyLossRatio = Math.abs(this.dailyPnL / this.dailyStartBalance) / (this.config.maxDailyLoss / 100);
      score += Math.min(dailyLossRatio, 1) * 10;

      return Math.min(score, 100);
    } catch (error) {
      this.logger.error('Error calculating risk score', { error: error.message });
      return 50; // Default medium risk
    }
  }

  /**
     * @notice Escalate risk level to higher severity
     * @param {string} currentLevel - Current risk level
     * @param {string} newLevel - Proposed new risk level
     * @returns {string} Higher of the two risk levels
     */
  _escalateRiskLevel (currentLevel, newLevel) {
    const levels = [RISK_LEVELS.LOW, RISK_LEVELS.MEDIUM, RISK_LEVELS.HIGH, RISK_LEVELS.CRITICAL];
    const currentIndex = levels.indexOf(currentLevel);
    const newIndex = levels.indexOf(newLevel);

    return levels[Math.max(currentIndex, newIndex)];
  }

  /**
     * @notice Check if position should be closed based on exit conditions
     * @param {Object} position - Position data
     * @param {number} currentPrice - Current market price
     * @returns {Object} Exit decision with reason
     */
  _checkPositionExitConditions (position, currentPrice) {
    try {
      // ============ Stop Loss Check ============
      if ((position.side === 'BUY' && currentPrice <= position.stopLoss) ||
                (position.side === 'SELL' && currentPrice >= position.stopLoss)) {
        return { exit: true, reason: 'STOP_LOSS' };
      }

      // ============ Take Profit Check ============
      if ((position.side === 'BUY' && currentPrice >= position.takeProfit) ||
                (position.side === 'SELL' && currentPrice <= position.takeProfit)) {
        return { exit: true, reason: 'TAKE_PROFIT' };
      }

      // ============ Maximum Loss Check ============
      if (position.currentPnL <= -this.config.stopLossPercent) {
        return { exit: true, reason: 'MAX_LOSS' };
      }

      // ============ Time-based Exit (for scalping) ============
      const positionAge = Date.now() - position.entryTime;
      const maxPositionTime = 15 * 60 * 1000; // 15 minutes for scalping

      if (positionAge > maxPositionTime && position.currentPnL > 0) {
        return { exit: true, reason: 'TIME_PROFIT' };
      }

      return { exit: false, reason: null };
    } catch (error) {
      this.logger.error('Error checking exit conditions', { error: error.message });
      return { exit: false, reason: null };
    }
  }

  /**
     * @notice Update performance metrics after position close
     * @param {number} pnl - Final P&L of closed position
     * @param {string} reason - Reason for closing
     */
  _updatePerformanceMetrics (pnl, _reason) {
    try {
      this.performanceMetrics.totalTrades++;

      if (pnl > 0) {
        this.performanceMetrics.winningTrades++;
        this.performanceMetrics.currentConsecutiveLosses = 0;

        // Update average win
        const totalWins = this.performanceMetrics.winningTrades;
        this.performanceMetrics.avgWin = ((this.performanceMetrics.avgWin * (totalWins - 1)) + pnl) / totalWins;
      } else {
        this.performanceMetrics.losingTrades++;
        this.performanceMetrics.currentConsecutiveLosses++;
        this.performanceMetrics.maxConsecutiveLosses = Math.max(
          this.performanceMetrics.maxConsecutiveLosses,
          this.performanceMetrics.currentConsecutiveLosses
        );

        // Update average loss
        const totalLosses = this.performanceMetrics.losingTrades;
        this.performanceMetrics.avgLoss = ((this.performanceMetrics.avgLoss * (totalLosses - 1)) + Math.abs(pnl)) / totalLosses;
      }

      // ============ Calculate Profit Factor ============
      const totalWins = this.performanceMetrics.winningTrades * this.performanceMetrics.avgWin;
      const totalLosses = this.performanceMetrics.losingTrades * this.performanceMetrics.avgLoss;

      this.performanceMetrics.profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;
    } catch (error) {
      this.logger.error('Error updating performance metrics', { error: error.message });
    }
  }

  /**
     * @notice Handle risk breach events
     * @param {Object} breach - Risk breach data
     */
  _handleRiskBreach (breach) {
    try {
      this.logger.error('Risk limit breached', breach);

      // ============ Trigger Emergency Actions ============
      switch (breach.type) {
        case RISK_EVENTS.DRAWDOWN_LIMIT_EXCEEDED:
        case RISK_EVENTS.DAILY_LOSS_LIMIT_EXCEEDED:
          this.emergencyStop = true;
          this.emit('emergency_stop_triggered', breach);
          break;

        default:
          this.emit('risk_limit_exceeded', breach);
          break;
      }

      // ============ Add to Alerts ============
      this.riskMetrics.alerts.push({
        ...breach,
        timestamp: Date.now()
      });

      // ============ Keep Only Recent Alerts ============
      if (this.riskMetrics.alerts.length > 100) {
        this.riskMetrics.alerts = this.riskMetrics.alerts.slice(-50);
      }
    } catch (error) {
      this.logger.error('Error handling risk breach', { error: error.message });
    }
  }

  /**
     * @notice Calculate comprehensive risk score for a trade
     * @param {Object} tradeParams - Trade parameters
     * @returns {number} Risk score between 0 and 1 (higher = riskier)
     */
  _calculateTradeRiskScore (tradeParams) {
    try {
      const { pair, amount, price } = tradeParams;
      let riskScore = 0;

      // ============ Position Size Risk (0-0.3) ============
      const tradeValue = amount * price;
      const portfolioPercentage = tradeValue / this.portfolioValue;
      const sizeRisk = Math.min(portfolioPercentage / this.config.maxPositionSize, 1) * 0.3;
      riskScore += sizeRisk;

      // ============ Volatility Risk (0-0.25) ============
      const volatility = this._getVolatility(pair);
      const volatilityRisk = Math.min(volatility / this.config.volatilityThreshold, 1) * 0.25;
      riskScore += volatilityRisk;

      // ============ Liquidity Risk (0-0.2) ============
      const liquidity = this._getLiquidity(pair);
      const liquidityRisk = Math.max(0, 1 - (liquidity / this.config.minLiquidity)) * 0.2;
      riskScore += liquidityRisk;

      // ============ Drawdown Risk (0-0.15) ============
      const drawdownRisk = (this.currentDrawdown / this.config.maxDrawdown) * 0.15;
      riskScore += drawdownRisk;

      // ============ Concurrent Positions Risk (0-0.1) ============
      const positionRisk = (this.activePositions.size / this.config.maxConcurrentTrades) * 0.1;
      riskScore += positionRisk;

      return Math.min(riskScore, 1); // Cap at 1.0
    } catch (error) {
      this.logger.error('Error calculating trade risk score', { error: error.message });
      return 0.8; // Conservative high risk if calculation fails
    }
  }

  /**
     * @notice Emit risk event with standardized format
     * @param {string} eventType - Type of risk event
     * @param {Object} data - Event data
     */
  _emitRiskEvent (eventType, data) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      data
    };

    this.emit('risk_event', event);
    this.logger.warn('Risk event emitted', event);
  }

  /**
     * @notice Reset daily metrics at start of new trading day
     * @dev Called automatically every 24 hours
     */
  _resetDailyMetrics () {
    this.dailyStartBalance = this.portfolioValue;
    this.dailyPnL = 0;
    this.riskLimitsBreached.clear();

    this.logger.info('Daily metrics reset', {
      newStartBalance: this.dailyStartBalance
    });
  }

  /**
     * @notice Generate comprehensive risk report
     * @dev Called periodically for monitoring and analysis
     */
  _generateRiskReport () {
    try {
      const report = {
        timestamp: Date.now(),
        riskLevel: this.riskMetrics.currentRiskLevel,
        riskScore: this.riskMetrics.riskScore,
        portfolioMetrics: {
          value: this.portfolioValue,
          drawdown: this.currentDrawdown,
          maxDrawdown: this.maxDrawdownReached,
          dailyPnL: this.dailyPnL
        },
        positionMetrics: {
          activeCount: this.activePositions.size,
          maxAllowed: this.config.maxConcurrentTrades,
          utilizationRate: (this.activePositions.size / this.config.maxConcurrentTrades) * 100
        },
        performanceMetrics: { ...this.performanceMetrics },
        recentAlerts: this.riskMetrics.alerts.slice(-5)
      };

      this.emit('risk_report', report);
    } catch (error) {
      this.logger.error('Error generating risk report', { error: error.message });
    }
  }

  // ============ Public API Methods ============

  /**
     * @notice Get current risk status
     * @returns {Object} Current risk metrics and status
     */
  getRiskStatus () {
    return {
      riskLevel: this.riskMetrics.currentRiskLevel,
      riskScore: this.riskMetrics.riskScore,
      emergencyStop: this.emergencyStop,
      drawdown: this.currentDrawdown,
      activePositions: this.activePositions.size,
      dailyPnL: this.dailyPnL,
      performanceMetrics: { ...this.performanceMetrics }
    };
  }

  /**
     * @notice Get risk configuration
     * @returns {Object} Current risk management configuration
     */
  getConfig () {
    return { ...this.config };
  }

  /**
     * @notice Update risk configuration
     * @param {Object} newConfig - New configuration parameters
     */
  updateConfig (newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Risk configuration updated', newConfig);
  }

  /**
     * @notice Reset emergency stop
     * @dev Allows manual override of emergency stop (use with caution)
     */
  resetEmergencyStop () {
    this.emergencyStop = false;
    this.riskLimitsBreached.clear();
    this.logger.info('Emergency stop reset manually');
    this.emit('emergency_stop_reset');
  }

  /**
     * @notice Get position history for analysis
     * @returns {Array} Array of closed positions
     */
  getPositionHistory () {
    return [...this.positionHistory];
  }

  /**
     * @notice Get active positions
     * @returns {Map} Map of active positions
     */
  getActivePositions () {
    return new Map(this.activePositions);
  }

  /**
     * @notice Update volatility data for a trading pair
     * @param {string} pair - Trading pair
     * @param {number} volatility - Current volatility measure
     */
  updateVolatility (pair, volatility) {
    this.riskMetrics.volatilityProfile.set(pair, {
      current: volatility,
      timestamp: Date.now()
    });
  }

  /**
     * @notice Update liquidity data for a trading pair
     * @param {string} pair - Trading pair
     * @param {number} liquidity - Current liquidity in USD
     */
  updateLiquidity (pair, liquidity) {
    this.riskMetrics.liquidityProfile.set(pair, {
      current: liquidity,
      timestamp: Date.now()
    });
  }

  /**
     * @notice Update correlation data between trading pairs
     * @param {string} pair1 - First trading pair
     * @param {string} pair2 - Second trading pair
     * @param {number} correlation - Correlation coefficient
     */
  updateCorrelation (pair1, pair2, correlation) {
    const key1 = `${pair1}_${pair2}`;
    const key2 = `${pair2}_${pair1}`;

    this.correlationMatrix.set(key1, correlation);
    this.correlationMatrix.set(key2, correlation);
  }

  /**
     * @notice Force close all positions (emergency action)
     * @dev Used during emergency stop or critical risk events
     */
  forceCloseAllPositions () {
    const positionsToClose = Array.from(this.activePositions.keys());

    this.logger.warn('Force closing all positions', {
      count: positionsToClose.length
    });

    for (const positionId of positionsToClose) {
      this.emit('force_close_position', { positionId });
    }

    // Clear all positions from tracking
    this.activePositions.clear();
  }

  /**
     * @notice Get risk summary for reporting
     * @returns {Object} Comprehensive risk summary
     */
  getRiskSummary () {
    return {
      // ============ Current Status ============
      status: {
        riskLevel: this.riskMetrics.currentRiskLevel,
        riskScore: this.riskMetrics.riskScore,
        emergencyStop: this.emergencyStop,
        lastUpdate: this.riskMetrics.lastUpdate
      },

      // ============ Portfolio Metrics ============
      portfolio: {
        currentValue: this.portfolioValue,
        startingValue: this.startingBalance,
        currentDrawdown: this.currentDrawdown,
        maxDrawdown: this.maxDrawdownReached,
        dailyPnL: this.dailyPnL,
        dailyReturn: this.dailyStartBalance > 0
          ? (this.dailyPnL / this.dailyStartBalance) * 100
          : 0
      },

      // ============ Position Metrics ============
      positions: {
        active: this.activePositions.size,
        maximum: this.config.maxConcurrentTrades,
        utilization: (this.activePositions.size / this.config.maxConcurrentTrades) * 100,
        totalHistorical: this.positionHistory.length
      },

      // ============ Performance Metrics ============
      performance: {
        ...this.performanceMetrics,
        winRate: this.performanceMetrics.totalTrades > 0
          ? (this.performanceMetrics.winningTrades / this.performanceMetrics.totalTrades) * 100
          : 0
      },

      // ============ Risk Configuration ============
      limits: {
        maxDrawdown: this.config.maxDrawdown,
        maxDailyLoss: this.config.maxDailyLoss,
        maxPositionSize: this.config.maxPositionSize,
        stopLoss: this.config.stopLossPercent,
        takeProfit: this.config.takeProfitPercent
      },

      // ============ Recent Alerts ============
      alerts: this.riskMetrics.alerts.slice(-10),

      // ============ Breached Limits ============
      breaches: Array.from(this.riskLimitsBreached)
    };
  }

  /**
     * @notice Validate risk configuration parameters
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result with errors if any
     */
  static validateConfig (config) {
    const errors = [];

    // ============ Required Parameters ============
    const requiredParams = [
      'maxDrawdown', 'maxPositionSize', 'stopLossPercent',
      'takeProfitPercent', 'maxConcurrentTrades'
    ];

    for (const param of requiredParams) {
      if (typeof config[param] !== 'number') {
        errors.push(`${param} must be a number`);
      }
    }

    // ============ Range Validations ============
    if (config.maxDrawdown < 0 || config.maxDrawdown > 50) {
      errors.push('maxDrawdown must be between 0 and 50');
    }

    if (config.maxPositionSize < 0.01 || config.maxPositionSize > 1) {
      errors.push('maxPositionSize must be between 0.01 and 1');
    }

    if (config.stopLossPercent < 0.1 || config.stopLossPercent > 10) {
      errors.push('stopLossPercent must be between 0.1 and 10');
    }

    if (config.takeProfitPercent < 0.1 || config.takeProfitPercent > 20) {
      errors.push('takeProfitPercent must be between 0.1 and 20');
    }

    if (config.maxConcurrentTrades < 1 || config.maxConcurrentTrades > 10) {
      errors.push('maxConcurrentTrades must be between 1 and 10');
    }

    // ============ Logical Validations ============
    if (config.takeProfitPercent <= config.stopLossPercent) {
      errors.push('takeProfitPercent must be greater than stopLossPercent');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
