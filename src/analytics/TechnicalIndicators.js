// ============ Imports ============
import { RSI, MACD, SMA, EMA, BollingerBands, Stochastic, ATR, OBV } from 'technicalindicators';
import { EventEmitter } from 'events';
import config from '../utils/Config.js';
import logger from '../utils/Logger.js';

/**
 * @title Technical Indicators Engine
 * @author Regav-AI Team
 * @notice Advanced technical analysis engine for scalping trading strategies
 * @dev Calculates multiple technical indicators and generates trading signals
 */
class TechnicalIndicators extends EventEmitter {
  constructor () {
    super();

    // Configuration
    this.config = config.getTradingConfig();

    // Indicator configurations
    this.indicators = {
      rsi: {
        period: this.config.rsi.period,
        overbought: this.config.rsi.overbought,
        oversold: this.config.rsi.oversold
      },
      macd: {
        fastPeriod: this.config.macd.fast,
        slowPeriod: this.config.macd.slow,
        signalPeriod: this.config.macd.signal
      },
      volume: {
        maPeriod: this.config.volume.maPeriod,
        minMultiplier: this.config.volume.minMultiplier
      },
      bollinger: {
        period: 20,
        stdDev: 2
      },
      stochastic: {
        kPeriod: 14,
        dPeriod: 3,
        kSlowing: 3
      },
      atr: {
        period: 14
      }
    };

    // Data storage for calculations
    this.priceData = new Map(); // symbol -> price history
    this.volumeData = new Map(); // symbol -> volume history
    this.calculatedIndicators = new Map(); // symbol -> calculated indicators

    // Signal tracking
    this.lastSignals = new Map(); // symbol -> last signal
    this.signalHistory = new Map(); // symbol -> signal history

    // Performance tracking
    this.metrics = {
      signalsGenerated: 0,
      successfulSignals: 0,
      calculationTime: 0,
      lastCalculationTime: null
    };
  }

  // ============ Data Management ============

  /**
     * @notice Add new price data point for analysis
     * @param {string} symbol Trading symbol
     * @param {object} pricePoint OHLCV data point
     */
  addPriceData (symbol, pricePoint) {
    try {
      // Validate price point
      this._validatePricePoint(pricePoint);

      // Initialize data arrays if needed
      if (!this.priceData.has(symbol)) {
        this.priceData.set(symbol, []);
        this.volumeData.set(symbol, []);
        this.calculatedIndicators.set(symbol, {});
      }

      // Add to price history
      const prices = this.priceData.get(symbol);
      const volumes = this.volumeData.get(symbol);

      prices.push({
        timestamp: pricePoint.timestamp,
        open: parseFloat(pricePoint.open),
        high: parseFloat(pricePoint.high),
        low: parseFloat(pricePoint.low),
        close: parseFloat(pricePoint.close)
      });

      volumes.push({
        timestamp: pricePoint.timestamp,
        volume: parseFloat(pricePoint.volume)
      });

      // Maintain data size (keep last 200 periods for calculations)
      const maxDataPoints = 200;
      if (prices.length > maxDataPoints) {
        prices.splice(0, prices.length - maxDataPoints);
        volumes.splice(0, volumes.length - maxDataPoints);
      }

      // Calculate indicators for this symbol
      this._calculateIndicators(symbol);

      logger.debug('Price data added and indicators calculated', {
        symbol,
        dataPoints: prices.length,
        timestamp: pricePoint.timestamp
      });
    } catch (error) {
      logger.error('Failed to add price data', {
        symbol,
        error: error.message,
        pricePoint
      });
      throw error;
    }
  }

  /**
     * @notice Add batch price data for backtesting or initialization
     * @param {string} symbol Trading symbol
     * @param {Array} priceHistory Array of OHLCV data
     */
  addBatchPriceData (symbol, priceHistory) {
    try {
      if (!Array.isArray(priceHistory) || priceHistory.length === 0) {
        throw new Error('Invalid price history data');
      }

      logger.info('Adding batch price data', {
        symbol,
        dataPoints: priceHistory.length
      });

      // Clear existing data
      this.priceData.set(symbol, []);
      this.volumeData.set(symbol, []);

      // Add each price point
      for (const pricePoint of priceHistory) {
        this.addPriceData(symbol, pricePoint);
      }

      logger.info('Batch price data added successfully', {
        symbol,
        finalDataPoints: this.priceData.get(symbol).length
      });
    } catch (error) {
      logger.error('Failed to add batch price data', {
        symbol,
        error: error.message
      });
      throw error;
    }
  }

  // ============ Indicator Calculations ============

  /**
     * @notice Calculate all technical indicators for a symbol
     * @param {string} symbol Trading symbol
     */
  _calculateIndicators (symbol) {
    const timer = logger.createPerformanceTimer('technical_indicators_calculation');

    try {
      const prices = this.priceData.get(symbol);
      const volumes = this.volumeData.get(symbol);

      if (!prices || prices.length < 50) {
        // Need at least 50 periods for reliable calculations
        return;
      }

      const indicators = {};

      // Extract price arrays
      const closes = prices.map(p => p.close);
      const highs = prices.map(p => p.high);
      const lows = prices.map(p => p.low);
      // const opens = prices.map(p => p.open); // Unused for now
      const volumeValues = volumes.map(v => v.volume);

      // Calculate RSI
      indicators.rsi = this._calculateRSI(closes);

      // Calculate MACD
      indicators.macd = this._calculateMACD(closes);

      // Calculate Moving Averages
      indicators.sma = this._calculateSMA(closes);
      indicators.ema = this._calculateEMA(closes);

      // Calculate Bollinger Bands
      indicators.bollinger = this._calculateBollingerBands(closes);

      // Calculate Stochastic
      indicators.stochastic = this._calculateStochastic(highs, lows, closes);

      // Calculate ATR (Average True Range)
      indicators.atr = this._calculateATR(highs, lows, closes);

      // Calculate Volume indicators
      indicators.volume = this._calculateVolumeIndicators(volumeValues);

      // Calculate OBV (On Balance Volume)
      indicators.obv = this._calculateOBV(closes, volumeValues);

      // Store calculated indicators
      this.calculatedIndicators.set(symbol, {
        ...indicators,
        timestamp: Date.now(),
        priceCount: prices.length
      });

      // Generate trading signals
      this._generateTradingSignals(symbol, indicators);

      const calculationTime = timer({
        success: true,
        symbol,
        indicatorCount: Object.keys(indicators).length
      });

      this.metrics.calculationTime += calculationTime;
      this.metrics.lastCalculationTime = Date.now();
    } catch (error) {
      timer({
        success: false,
        error: error.message,
        symbol
      });

      logger.error('Failed to calculate indicators', {
        symbol,
        error: error.message
      });
      throw error;
    }
  }

  /**
     * @notice Calculate RSI (Relative Strength Index)
     * @param {Array} closes Array of closing prices
     * @return {object} RSI data
     */
  _calculateRSI (closes) {
    try {
      const rsiValues = RSI.calculate({
        values: closes,
        period: this.indicators.rsi.period
      });

      const currentRSI = rsiValues[rsiValues.length - 1];
      const previousRSI = rsiValues[rsiValues.length - 2];

      return {
        current: currentRSI,
        previous: previousRSI,
        values: rsiValues,
        signal: this._interpretRSI(currentRSI, previousRSI),
        overbought: currentRSI > this.indicators.rsi.overbought,
        oversold: currentRSI < this.indicators.rsi.oversold
      };
    } catch (error) {
      logger.error('RSI calculation failed', error);
      return { current: 50, previous: 50, signal: 'NEUTRAL' };
    }
  }

  /**
     * @notice Calculate MACD (Moving Average Convergence Divergence)
     * @param {Array} closes Array of closing prices
     * @return {object} MACD data
     */
  _calculateMACD (closes) {
    try {
      const macdValues = MACD.calculate({
        values: closes,
        fastPeriod: this.indicators.macd.fastPeriod,
        slowPeriod: this.indicators.macd.slowPeriod,
        signalPeriod: this.indicators.macd.signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });

      const current = macdValues[macdValues.length - 1];
      const previous = macdValues[macdValues.length - 2];

      return {
        current: current || { MACD: 0, signal: 0, histogram: 0 },
        previous: previous || { MACD: 0, signal: 0, histogram: 0 },
        values: macdValues,
        signal: this._interpretMACD(current, previous),
        bullishCrossover: this._detectMACDCrossover(current, previous, 'bullish'),
        bearishCrossover: this._detectMACDCrossover(current, previous, 'bearish')
      };
    } catch (error) {
      logger.error('MACD calculation failed', error);
      return {
        current: { MACD: 0, signal: 0, histogram: 0 },
        signal: 'NEUTRAL'
      };
    }
  }

  /**
     * @notice Calculate Simple Moving Average
     * @param {Array} closes Array of closing prices
     * @return {object} SMA data
     */
  _calculateSMA (closes) {
    try {
      const sma20 = SMA.calculate({ period: 20, values: closes });
      const sma50 = SMA.calculate({ period: 50, values: closes });

      return {
        sma20: {
          current: sma20[sma20.length - 1],
          previous: sma20[sma20.length - 2],
          values: sma20
        },
        sma50: {
          current: sma50[sma50.length - 1],
          previous: sma50[sma50.length - 2],
          values: sma50
        },
        signal: this._interpretMovingAverages(sma20, sma50, closes)
      };
    } catch (error) {
      logger.error('SMA calculation failed', error);
      return { signal: 'NEUTRAL' };
    }
  }

  /**
     * @notice Calculate Exponential Moving Average
     * @param {Array} closes Array of closing prices
     * @return {object} EMA data
     */
  _calculateEMA (closes) {
    try {
      const ema12 = EMA.calculate({ period: 12, values: closes });
      const ema26 = EMA.calculate({ period: 26, values: closes });

      return {
        ema12: {
          current: ema12[ema12.length - 1],
          previous: ema12[ema12.length - 2],
          values: ema12
        },
        ema26: {
          current: ema26[ema26.length - 1],
          previous: ema26[ema26.length - 2],
          values: ema26
        },
        signal: this._interpretEMA(ema12, ema26, closes)
      };
    } catch (error) {
      logger.error('EMA calculation failed', error);
      return { signal: 'NEUTRAL' };
    }
  }

  /**
     * @notice Calculate Bollinger Bands
     * @param {Array} closes Array of closing prices
     * @return {object} Bollinger Bands data
     */
  _calculateBollingerBands (closes) {
    try {
      const bbValues = BollingerBands.calculate({
        period: this.indicators.bollinger.period,
        values: closes,
        stdDev: this.indicators.bollinger.stdDev
      });

      const current = bbValues[bbValues.length - 1];
      const currentPrice = closes[closes.length - 1];

      return {
        current: current || { upper: 0, middle: 0, lower: 0 },
        values: bbValues,
        signal: this._interpretBollingerBands(current, currentPrice),
        percentB: this._calculatePercentB(current, currentPrice),
        squeeze: this._detectBollingerSqueeze(bbValues.slice(-20))
      };
    } catch (error) {
      logger.error('Bollinger Bands calculation failed', error);
      return { signal: 'NEUTRAL' };
    }
  }

  /**
     * @notice Calculate Stochastic Oscillator
     * @param {Array} highs Array of high prices
     * @param {Array} lows Array of low prices
     * @param {Array} closes Array of closing prices
     * @return {object} Stochastic data
     */
  _calculateStochastic (highs, lows, closes) {
    try {
      const stochValues = Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        kPeriod: this.indicators.stochastic.kPeriod,
        dPeriod: this.indicators.stochastic.dPeriod,
        kSlowing: this.indicators.stochastic.kSlowing
      });

      const current = stochValues[stochValues.length - 1];
      const previous = stochValues[stochValues.length - 2];

      return {
        current: current || { k: 50, d: 50 },
        previous: previous || { k: 50, d: 50 },
        values: stochValues,
        signal: this._interpretStochastic(current, previous),
        overbought: current && current.k > 80,
        oversold: current && current.k < 20
      };
    } catch (error) {
      logger.error('Stochastic calculation failed', error);
      return { signal: 'NEUTRAL' };
    }
  }

  /**
     * @notice Calculate ATR (Average True Range)
     * @param {Array} highs Array of high prices
     * @param {Array} lows Array of low prices
     * @param {Array} closes Array of closing prices
     * @return {object} ATR data
     */
  _calculateATR (highs, lows, closes) {
    try {
      const atrValues = ATR.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: this.indicators.atr.period
      });

      const current = atrValues[atrValues.length - 1];
      const average = atrValues.slice(-20).reduce((a, b) => a + b, 0) / 20;

      return {
        current,
        average,
        values: atrValues,
        volatility: this._interpretATR(current, average),
        percentile: this._calculateATRPercentile(atrValues, current)
      };
    } catch (error) {
      logger.error('ATR calculation failed', error);
      return { current: 0, volatility: 'MEDIUM' };
    }
  }

  /**
     * @notice Calculate volume indicators
     * @param {Array} closes Array of closing prices
     * @param {Array} volumes Array of volume data
     * @return {object} Volume indicators
     */
  _calculateVolumeIndicators (volumes) {
    try {
      if (volumes.length < this.indicators.volume.maPeriod) {
        return { signal: 'NEUTRAL' };
      }

      // Calculate volume moving average
      const volumeMA = SMA.calculate({
        period: this.indicators.volume.maPeriod,
        values: volumes
      });

      const currentVolume = volumes[volumes.length - 1];
      const currentVolumeMA = volumeMA[volumeMA.length - 1];
      const previousVolume = volumes[volumes.length - 2];

      return {
        current: currentVolume,
        average: currentVolumeMA,
        ratio: currentVolume / currentVolumeMA,
        signal: this._interpretVolume(currentVolume, currentVolumeMA, previousVolume),
        spike: currentVolume > (currentVolumeMA * this.indicators.volume.minMultiplier),
        trend: this._analyzeVolumeTrend(volumes.slice(-10))
      };
    } catch (error) {
      logger.error('Volume calculation failed', error);
      return { signal: 'NEUTRAL' };
    }
  }

  /**
     * @notice Calculate OBV (On Balance Volume)
     * @param {Array} closes Array of closing prices
     * @param {Array} volumes Array of volume data
     * @return {object} OBV data
     */
  _calculateOBV (closes, volumes) {
    try {
      const obvValues = OBV.calculate({
        close: closes,
        volume: volumes
      });

      const current = obvValues[obvValues.length - 1];
      const previous = obvValues[obvValues.length - 2];
      const obvMA = SMA.calculate({ period: 20, values: obvValues });

      return {
        current,
        previous,
        values: obvValues,
        movingAverage: obvMA[obvMA.length - 1],
        signal: this._interpretOBV(current, previous, obvMA),
        trend: current > previous ? 'RISING' : 'FALLING'
      };
    } catch (error) {
      logger.error('OBV calculation failed', error);
      return { signal: 'NEUTRAL' };
    }
  }

  // ============ Signal Interpretation ============

  /**
     * @notice Interpret RSI signal
     * @param {number} current Current RSI value
     * @param {number} previous Previous RSI value
     * @return {string} Signal interpretation
     */
  _interpretRSI (current, previous) {
    if (!current || !previous) return 'NEUTRAL';

    // Oversold bounce
    if (current > this.indicators.rsi.oversold && previous <= this.indicators.rsi.oversold) {
      return 'BUY';
    }

    // Overbought reversal
    if (current < this.indicators.rsi.overbought && previous >= this.indicators.rsi.overbought) {
      return 'SELL';
    }

    // Trend continuation signals
    if (current > 50 && previous <= 50) return 'BUY_WEAK';
    if (current < 50 && previous >= 50) return 'SELL_WEAK';

    return 'NEUTRAL';
  }

  /**
     * @notice Interpret MACD signal
     * @param {object} current Current MACD values
     * @param {object} previous Previous MACD values
     * @return {string} Signal interpretation
     */
  _interpretMACD (current, previous) {
    if (!current || !previous) return 'NEUTRAL';

    // Bullish crossover
    if (current.MACD > current.signal && previous.MACD <= previous.signal) {
      return 'BUY';
    }

    // Bearish crossover
    if (current.MACD < current.signal && previous.MACD >= previous.signal) {
      return 'SELL';
    }

    // Histogram increasing (momentum building)
    if (current.histogram > previous.histogram && current.histogram > 0) {
      return 'BUY_WEAK';
    }

    if (current.histogram < previous.histogram && current.histogram < 0) {
      return 'SELL_WEAK';
    }

    return 'NEUTRAL';
  }

  /**
     * @notice Detect MACD crossover
     * @param {object} current Current MACD values
     * @param {object} previous Previous MACD values
     * @param {string} type Crossover type ('bullish' or 'bearish')
     * @return {boolean} True if crossover detected
     */
  _detectMACDCrossover (current, previous, type) {
    if (!current || !previous) return false;

    if (type === 'bullish') {
      return current.MACD > current.signal && previous.MACD <= previous.signal;
    } else {
      return current.MACD < current.signal && previous.MACD >= previous.signal;
    }
  }

  /**
     * @notice Generate comprehensive trading signals
     * @param {string} symbol Trading symbol
     * @param {object} indicators Calculated indicators
     */
  _generateTradingSignals (symbol, indicators) {
    try {
      const signals = [];
      let overallSignal = 'NEUTRAL';
      let signalStrength = 0;
      let confidence = 0;

      // RSI signals
      if (indicators.rsi.signal === 'BUY') {
        signals.push({ type: 'RSI', signal: 'BUY', strength: 0.8 });
        signalStrength += 0.8;
      } else if (indicators.rsi.signal === 'SELL') {
        signals.push({ type: 'RSI', signal: 'SELL', strength: 0.8 });
        signalStrength -= 0.8;
      }

      // MACD signals
      if (indicators.macd.signal === 'BUY') {
        signals.push({ type: 'MACD', signal: 'BUY', strength: 0.9 });
        signalStrength += 0.9;
      } else if (indicators.macd.signal === 'SELL') {
        signals.push({ type: 'MACD', signal: 'SELL', strength: 0.9 });
        signalStrength -= 0.9;
      }

      // Volume confirmation
      if (indicators.volume.spike) {
        const volumeStrength = signalStrength > 0 ? 0.3 : -0.3;
        signals.push({ type: 'VOLUME', signal: signalStrength > 0 ? 'BUY' : 'SELL', strength: Math.abs(volumeStrength) });
        signalStrength += volumeStrength;
      }

      // Moving average signals
      if (indicators.sma.signal === 'BUY') {
        signals.push({ type: 'SMA', signal: 'BUY', strength: 0.6 });
        signalStrength += 0.6;
      } else if (indicators.sma.signal === 'SELL') {
        signals.push({ type: 'SMA', signal: 'SELL', strength: 0.6 });
        signalStrength -= 0.6;
      }

      // Determine overall signal
      if (signalStrength > 1.0) {
        overallSignal = 'BUY';
        confidence = Math.min(signalStrength / 2.0, 1.0);
      } else if (signalStrength < -1.0) {
        overallSignal = 'SELL';
        confidence = Math.min(Math.abs(signalStrength) / 2.0, 1.0);
      } else {
        overallSignal = 'NEUTRAL';
        confidence = 0.1;
      }

      const tradingSignal = {
        symbol,
        signal: overallSignal,
        strength: Math.abs(signalStrength),
        confidence,
        components: signals,
        indicators: {
          rsi: indicators.rsi.current,
          macd: indicators.macd.current,
          volume: indicators.volume.ratio,
          volatility: indicators.atr.volatility
        },
        timestamp: Date.now()
      };

      // Store signal
      this.lastSignals.set(symbol, tradingSignal);

      // Add to history
      if (!this.signalHistory.has(symbol)) {
        this.signalHistory.set(symbol, []);
      }
      const history = this.signalHistory.get(symbol);
      history.push(tradingSignal);

      // Keep only last 100 signals
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }

      // Update metrics
      this.metrics.signalsGenerated++;

      // Emit signal event
      this.emit('signal_generated', tradingSignal);

      logger.debug('Trading signal generated', {
        symbol,
        signal: overallSignal,
        strength: signalStrength,
        confidence,
        componentsCount: signals.length
      });
    } catch (error) {
      logger.error('Failed to generate trading signals', {
        symbol,
        error: error.message
      });
    }
  }

  // ============ Utility Methods ============

  /**
     * @notice Validate price point data
     * @param {object} pricePoint Price data point
     */
  _validatePricePoint (pricePoint) {
    const required = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
    const missing = required.filter(field => pricePoint[field] === undefined);

    if (missing.length > 0) {
      throw new Error(`Missing required price data fields: ${missing.join(', ')}`);
    }

    // Validate price relationships
    const { open, high, low, close } = pricePoint;
    if (high < Math.max(open, close) || low > Math.min(open, close)) {
      throw new Error('Invalid price relationships: high/low inconsistent with open/close');
    }

    if (pricePoint.volume < 0) {
      throw new Error('Volume cannot be negative');
    }
  }

  /**
     * @notice Interpret moving averages
     * @param {Array} sma20 20-period SMA values
     * @param {Array} sma50 50-period SMA values
     * @param {Array} closes Closing prices
     * @return {string} Signal interpretation
     */
  _interpretMovingAverages (sma20, sma50, closes) {
    if (!sma20.length || !sma50.length || !closes.length) return 'NEUTRAL';

    const currentPrice = closes[closes.length - 1];
    const currentSMA20 = sma20[sma20.length - 1];
    const currentSMA50 = sma50[sma50.length - 1];
    const previousSMA20 = sma20[sma20.length - 2];
    const previousSMA50 = sma50[sma50.length - 2];

    // Golden cross (SMA20 crosses above SMA50)
    if (currentSMA20 > currentSMA50 && previousSMA20 <= previousSMA50) {
      return 'BUY';
    }

    // Death cross (SMA20 crosses below SMA50)
    if (currentSMA20 < currentSMA50 && previousSMA20 >= previousSMA50) {
      return 'SELL';
    }

    // Price above both MAs
    if (currentPrice > currentSMA20 && currentPrice > currentSMA50) {
      return 'BUY_WEAK';
    }

    // Price below both MAs
    if (currentPrice < currentSMA20 && currentPrice < currentSMA50) {
      return 'SELL_WEAK';
    }

    return 'NEUTRAL';
  }

  /**
     * @notice Interpret EMA signals
     * @param {Array} ema12 12-period EMA values
     * @param {Array} ema26 26-period EMA values
     * @param {Array} closes Closing prices
     * @return {string} Signal interpretation
     */
  _interpretEMA (ema12, ema26, closes) {
    if (!ema12.length || !ema26.length) return 'NEUTRAL';

    const currentPrice = closes[closes.length - 1];
    const currentEMA12 = ema12[ema12.length - 1];
    const currentEMA26 = ema26[ema26.length - 1];

    // Price above both EMAs and EMA12 > EMA26
    if (currentPrice > currentEMA12 && currentEMA12 > currentEMA26) {
      return 'BUY';
    }

    // Price below both EMAs and EMA12 < EMA26
    if (currentPrice < currentEMA12 && currentEMA12 < currentEMA26) {
      return 'SELL';
    }

    return 'NEUTRAL';
  }

  /**
     * @notice Interpret Bollinger Bands signals
     * @param {object} bands Bollinger Bands values
     * @param {number} price Current price
     * @return {string} Signal interpretation
     */
  _interpretBollingerBands (bands, price) {
    if (!bands) return 'NEUTRAL';

    // Price touching lower band (potential buy)
    if (price <= bands.lower) {
      return 'BUY';
    }

    // Price touching upper band (potential sell)
    if (price >= bands.upper) {
      return 'SELL';
    }

    return 'NEUTRAL';
  }

  /**
     * @notice Calculate Percent B for Bollinger Bands
     * @param {object} bands Bollinger Bands values
     * @param {number} price Current price
     * @return {number} Percent B value
     */
  _calculatePercentB (bands, price) {
    if (!bands || bands.upper === bands.lower) return 0.5;
    return (price - bands.lower) / (bands.upper - bands.lower);
  }

  /**
     * @notice Detect Bollinger Band squeeze
     * @param {Array} bandsHistory Recent Bollinger Bands history
     * @return {boolean} True if squeeze detected
     */
  _detectBollingerSqueeze (bandsHistory) {
    if (!bandsHistory || bandsHistory.length < 10) return false;

    // Calculate average band width over last 10 periods
    const bandWidths = bandsHistory.map(bands =>
      bands ? (bands.upper - bands.lower) / bands.middle : 0
    );

    const averageWidth = bandWidths.reduce((a, b) => a + b, 0) / bandWidths.length;
    const currentWidth = bandWidths[bandWidths.length - 1];

    // Squeeze if current width is significantly below average
    return currentWidth < (averageWidth * 0.7);
  }

  /**
     * @notice Interpret Stochastic signals
     * @param {object} current Current Stochastic values
     * @param {object} previous Previous Stochastic values
     * @return {string} Signal interpretation
     */
  _interpretStochastic (current, previous) {
    if (!current || !previous) return 'NEUTRAL';

    // %K crosses above %D in oversold region
    if (current.k > current.d && previous.k <= previous.d && current.k < 30) {
      return 'BUY';
    }

    // %K crosses below %D in overbought region
    if (current.k < current.d && previous.k >= previous.d && current.k > 70) {
      return 'SELL';
    }

    return 'NEUTRAL';
  }

  /**
     * @notice Interpret ATR (volatility) signals
     * @param {number} current Current ATR value
     * @param {number} average Average ATR value
     * @return {string} Volatility interpretation
     */
  _interpretATR (current, average) {
    if (!current || !average) return 'MEDIUM';

    const ratio = current / average;

    if (ratio > 1.5) return 'HIGH';
    if (ratio < 0.7) return 'LOW';
    return 'MEDIUM';
  }

  /**
     * @notice Calculate ATR percentile
     * @param {Array} atrValues ATR value history
     * @param {number} current Current ATR value
     * @return {number} Percentile (0-100)
     */
  _calculateATRPercentile (atrValues, current) {
    if (!atrValues || atrValues.length === 0) return 50;

    const sorted = [...atrValues].sort((a, b) => a - b);
    const lowerCount = sorted.filter(val => val < current).length;

    return (lowerCount / sorted.length) * 100;
  }

  /**
     * @notice Interpret volume signals
     * @param {number} current Current volume
     * @param {number} average Average volume
     * @param {number} previous Previous volume
     * @return {string} Volume signal interpretation
     */
  _interpretVolume (current, average, previous) {
    if (!current || !average) return 'NEUTRAL';

    const ratio = current / average;
    const change = (current - previous) / previous;

    // High volume spike
    if (ratio > this.indicators.volume.minMultiplier) {
      return 'SPIKE';
    }

    // Increasing volume
    if (change > 0.2) {
      return 'INCREASING';
    }

    // Decreasing volume
    if (change < -0.2) {
      return 'DECREASING';
    }

    return 'NEUTRAL';
  }

  /**
     * @notice Analyze volume trend
     * @param {Array} recentVolumes Recent volume data
     * @return {string} Volume trend
     */
  _analyzeVolumeTrend (recentVolumes) {
    if (!recentVolumes || recentVolumes.length < 3) return 'NEUTRAL';

    const first = recentVolumes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const last = recentVolumes.slice(-3).reduce((a, b) => a + b, 0) / 3;

    const change = (last - first) / first;

    if (change > 0.1) return 'RISING';
    if (change < -0.1) return 'FALLING';
    return 'NEUTRAL';
  }

  /**
     * @notice Interpret OBV signals
     * @param {number} current Current OBV value
     * @param {number} previous Previous OBV value
     * @param {Array} obvMA OBV moving average
     * @return {string} OBV signal interpretation
     */
  _interpretOBV (current, previous, obvMA) {
    if (!current || !previous || !obvMA.length) return 'NEUTRAL';

    const currentMA = obvMA[obvMA.length - 1];

    // OBV trending up and above MA
    if (current > previous && current > currentMA) {
      return 'BUY';
    }

    // OBV trending down and below MA
    if (current < previous && current < currentMA) {
      return 'SELL';
    }

    return 'NEUTRAL';
  }

  // ============ Public API ============

  /**
     * @notice Get current indicators for a symbol
     * @param {string} symbol Trading symbol
     * @return {object|null} Current indicators or null if not available
     */
  getIndicators (symbol) {
    return this.calculatedIndicators.get(symbol) || null;
  }

  /**
     * @notice Get last trading signal for a symbol
     * @param {string} symbol Trading symbol
     * @return {object|null} Last signal or null if not available
     */
  getLastSignal (symbol) {
    return this.lastSignals.get(symbol) || null;
  }

  /**
     * @notice Get signal history for a symbol
     * @param {string} symbol Trading symbol
     * @param {number} limit Maximum number of signals to return
     * @return {Array} Array of historical signals
     */
  getSignalHistory (symbol, limit = 50) {
    const history = this.signalHistory.get(symbol) || [];
    return history.slice(-limit);
  }

  /**
     * @notice Get all available symbols with indicators
     * @return {Array} Array of symbols
     */
  getAvailableSymbols () {
    return Array.from(this.calculatedIndicators.keys());
  }

  /**
     * @notice Get comprehensive market analysis for a symbol
     * @param {string} symbol Trading symbol
     * @return {object} Comprehensive analysis
     */
  getMarketAnalysis (symbol) {
    const indicators = this.getIndicators(symbol);
    const signal = this.getLastSignal(symbol);
    const prices = this.priceData.get(symbol);

    if (!indicators || !prices) {
      return {
        symbol,
        error: 'Insufficient data for analysis',
        dataPoints: prices ? prices.length : 0
      };
    }

    const currentPrice = prices[prices.length - 1].close;
    const previousPrice = prices[prices.length - 2]?.close;
    const priceChange = previousPrice ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;

    return {
      symbol,
      timestamp: Date.now(),
      price: {
        current: currentPrice,
        change: priceChange,
        trend: priceChange > 0 ? 'UP' : priceChange < 0 ? 'DOWN' : 'FLAT'
      },
      indicators: {
        rsi: {
          value: indicators.rsi.current,
          signal: indicators.rsi.signal,
          overbought: indicators.rsi.overbought,
          oversold: indicators.rsi.oversold
        },
        macd: {
          value: indicators.macd.current.MACD,
          signal: indicators.macd.signal,
          histogram: indicators.macd.current.histogram,
          bullishCrossover: indicators.macd.bullishCrossover,
          bearishCrossover: indicators.macd.bearishCrossover
        },
        volume: {
          current: indicators.volume.current,
          average: indicators.volume.average,
          ratio: indicators.volume.ratio,
          spike: indicators.volume.spike,
          trend: indicators.volume.trend
        },
        volatility: {
          atr: indicators.atr.current,
          level: indicators.atr.volatility,
          percentile: indicators.atr.percentile
        },
        bollinger: {
          percentB: indicators.bollinger.percentB,
          squeeze: indicators.bollinger.squeeze,
          signal: indicators.bollinger.signal
        }
      },
      signal: signal
        ? {
            action: signal.signal,
            strength: signal.strength,
            confidence: signal.confidence,
            components: signal.components.length
          }
        : null,
      dataQuality: {
        dataPoints: prices.length,
        lastUpdate: indicators.timestamp,
        isReliable: prices.length >= 50
      }
    };
  }

  /**
     * @notice Check if symbol has sufficient data for analysis
     * @param {string} symbol Trading symbol
     * @return {boolean} True if sufficient data available
     */
  hasSufficientData (symbol) {
    const prices = this.priceData.get(symbol);
    return prices && prices.length >= 50; // Need at least 50 periods
  }

  /**
     * @notice Get technical analysis summary for multiple symbols
     * @param {Array} symbols Array of symbols to analyze
     * @return {object} Summary analysis
     */
  getMultiSymbolAnalysis (symbols) {
    const analysis = {};
    let totalSignals = 0;
    let buySignals = 0;
    let sellSignals = 0;

    for (const symbol of symbols) {
      const signal = this.getLastSignal(symbol);
      if (signal) {
        analysis[symbol] = {
          signal: signal.signal,
          confidence: signal.confidence,
          strength: signal.strength
        };
        totalSignals++;

        if (signal.signal === 'BUY') buySignals++;
        else if (signal.signal === 'SELL') sellSignals++;
      }
    }

    return {
      symbols: Object.keys(analysis),
      summary: {
        total: totalSignals,
        buy: buySignals,
        sell: sellSignals,
        neutral: totalSignals - buySignals - sellSignals,
        marketSentiment: buySignals > sellSignals ? 'BULLISH' : sellSignals > buySignals ? 'BEARISH' : 'NEUTRAL'
      },
      details: analysis,
      timestamp: Date.now()
    };
  }

  /**
     * @notice Get performance metrics
     * @return {object} Performance metrics
     */
  getMetrics () {
    return {
      ...this.metrics,
      symbolsTracked: this.calculatedIndicators.size,
      activeSignals: this.lastSignals.size,
      averageCalculationTime: this.metrics.calculationTime / Math.max(this.metrics.signalsGenerated, 1)
    };
  }

  /**
     * @notice Reset all data and indicators
     */
  reset () {
    this.priceData.clear();
    this.volumeData.clear();
    this.calculatedIndicators.clear();
    this.lastSignals.clear();
    this.signalHistory.clear();

    this.metrics = {
      signalsGenerated: 0,
      successfulSignals: 0,
      calculationTime: 0,
      lastCalculationTime: null
    };

    logger.info('Technical indicators engine reset');
    this.emit('reset');
  }

  /**
     * @notice Clean up old data to free memory
     * @param {number} maxAge Maximum age in milliseconds (default: 24 hours)
     */
  cleanup (maxAge = 24 * 60 * 60 * 1000) {
    const cutoffTime = Date.now() - maxAge;
    let cleanedSymbols = 0;

    for (const [symbol, prices] of this.priceData.entries()) {
      // Remove old price data
      const filteredPrices = prices.filter(p => p.timestamp > cutoffTime);

      if (filteredPrices.length === 0) {
        // Remove symbol entirely if no recent data
        this.priceData.delete(symbol);
        this.volumeData.delete(symbol);
        this.calculatedIndicators.delete(symbol);
        this.lastSignals.delete(symbol);
        this.signalHistory.delete(symbol);
        cleanedSymbols++;
      } else if (filteredPrices.length < prices.length) {
        // Update with filtered data
        this.priceData.set(symbol, filteredPrices);

        // Also filter volume data
        const volumes = this.volumeData.get(symbol);
        if (volumes) {
          const filteredVolumes = volumes.filter(v => v.timestamp > cutoffTime);
          this.volumeData.set(symbol, filteredVolumes);
        }
      }
    }

    logger.info('Technical indicators cleanup completed', {
      cleanedSymbols,
      remainingSymbols: this.priceData.size
    });

    this.emit('cleanup', { cleanedSymbols, remainingSymbols: this.priceData.size });
  }
}

export default TechnicalIndicators;
