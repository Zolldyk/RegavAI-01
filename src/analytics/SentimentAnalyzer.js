// ============ Imports ============
import { Logger } from '../utils/Logger.js';
import { CONFIG } from '../config/trading.js';

// ============ Constants ============
const SENTIMENT_LEVELS = {
    VERY_BEARISH: 0.0,
    BEARISH: 0.25,
    NEUTRAL: 0.5,
    BULLISH: 0.75,
    VERY_BULLISH: 1.0
};

const NEWS_IMPACT_WEIGHTS = {
    REGULATION: 0.8,
    ADOPTION: 0.7,
    TECHNOLOGY: 0.6,
    MARKET: 0.9,
    CELEBRITY: 0.3,
    FUD: 0.7
};

const SOCIAL_PLATFORMS = {
    TWITTER: 'twitter',
    REDDIT: 'reddit',
    TELEGRAM: 'telegram',
    DISCORD: 'discord'
};

/**
 * @title SentimentAnalyzer
 * @notice Advanced sentiment analysis using Gaia AI for cryptocurrency trading
 * @dev Processes social media, news, and market sentiment to generate trading signals
 */
export class SentimentAnalyzer {
    constructor(gaiaClient, logger = new Logger('SentimentAnalyzer')) {
        // ============ Core Dependencies ============
        this.gaia = gaiaClient;
        this.logger = logger;
        
        // ============ Sentiment Data Cache ============
        this.sentimentCache = new Map(); // pair -> sentiment data
        this.newsCache = new Map(); // timestamp -> news data
        this.socialCache = new Map(); // platform -> social data
        
        // ============ Analysis History ============
        this.sentimentHistory = new Map(); // pair -> historical sentiment
        this.newsHistory = [];
        this.socialHistory = new Map();
        
        // ============ Configuration ============
        this.config = {
            updateInterval: CONFIG.SENTIMENT_UPDATE_INTERVAL || 30000, // 30 seconds
            historyLength: CONFIG.SENTIMENT_HISTORY_LENGTH || 100,
            newsLookbackHours: CONFIG.NEWS_LOOKBACK_HOURS || 24,
            socialLookbackHours: CONFIG.SOCIAL_LOOKBACK_HOURS || 6,
            minConfidenceThreshold: 0.6
        };
        
        // ============ Sentiment Weights ============
        this.weights = {
            news: 0.4,      // News impact weight
            social: 0.35,   // Social media weight
            technical: 0.15, // Technical sentiment weight
            whale: 0.1      // Whale activity weight
        };
        
        // ============ Real-time Monitoring ============
        this.isMonitoring = false;
        this.monitoringInterval = null;
        
        this.logger.info('SentimentAnalyzer initialized', {
            updateInterval: this.config.updateInterval,
            historyLength: this.config.historyLength
        });
    }

    // ============ Core Sentiment Analysis ============
    
    /**
     * @notice Start real-time sentiment monitoring
     * @dev Begins continuous sentiment analysis for all trading pairs
     */
    async startMonitoring(tradingPairs) {
        try {
            this.isMonitoring = true;
            this.tradingPairs = tradingPairs;
            
            this.logger.info('Starting sentiment monitoring', { pairs: tradingPairs });
            
            // Initial sentiment analysis
            await this._performInitialAnalysis();
            
            // Start continuous monitoring
            this.monitoringInterval = setInterval(async () => {
                if (this.isMonitoring) {
                    await this._updateSentimentData();
                }
            }, this.config.updateInterval);
            
            this.logger.info('Sentiment monitoring started successfully');
            
        } catch (error) {
            this.logger.error('Failed to start sentiment monitoring', { error: error.message });
            throw error;
        }
    }
    
    /**
     * @notice Stop sentiment monitoring
     * @dev Cleanly stops all monitoring processes
     */
    async stopMonitoring() {
        try {
            this.isMonitoring = false;
            
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
                this.monitoringInterval = null;
            }
            
            this.logger.info('Sentiment monitoring stopped');
            
        } catch (error) {
            this.logger.error('Error stopping sentiment monitoring', { error: error.message });
        }
    }
    
    /**
     * @notice Get comprehensive sentiment analysis for a trading pair
     * @param {string} pair - Trading pair (e.g., "BTC/USDT")
     * @returns {Object} Complete sentiment analysis
     */
    async getSentimentAnalysis(pair) {
        try {
            // Check cache first
            const cached = this.sentimentCache.get(pair);
            if (cached && Date.now() - cached.timestamp < this.config.updateInterval) {
                return cached;
            }
            
            // Perform fresh analysis
            const sentiment = await this._analyzePairSentiment(pair);
            
            // Cache the result
            this.sentimentCache.set(pair, {
                ...sentiment,
                timestamp: Date.now()
            });
            
            // Update history
            this._updateSentimentHistory(pair, sentiment);
            
            return sentiment;
            
        } catch (error) {
            this.logger.error(`Failed to get sentiment analysis for ${pair}`, { error: error.message });
            return this._getDefaultSentiment(pair);
        }
    }
    
    /**
     * @notice Analyze sentiment for specific trading pair
     * @param {string} pair - Trading pair
     * @returns {Object} Sentiment analysis result
     */
    async _analyzePairSentiment(pair) {
        try {
            const [baseAsset] = pair.split('/');
            
            // ============ Gather Sentiment Data ============
            const [newsAnalysis, socialAnalysis, whaleAnalysis] = await Promise.allSettled([
                this._analyzeNews(baseAsset),
                this._analyzeSocialSentiment(baseAsset),
                this._analyzeWhaleActivity(baseAsset)
            ]);
            
            // ============ Process Results ============
            const news = newsAnalysis.status === 'fulfilled' ? newsAnalysis.value : this._getDefaultNews();
            const social = socialAnalysis.status === 'fulfilled' ? socialAnalysis.value : this._getDefaultSocial();
            const whale = whaleAnalysis.status === 'fulfilled' ? whaleAnalysis.value : this._getDefaultWhale();
            
            // ============ Calculate Composite Sentiment ============
            const compositeSentiment = this._calculateCompositeSentiment(news, social, whale);
            
            // ============ Generate Trading Signals ============
            const signals = this._generateSentimentSignals(compositeSentiment, pair);
            
            return {
                pair,
                score: compositeSentiment.score,
                confidence: compositeSentiment.confidence,
                trend: compositeSentiment.trend,
                components: {
                    news,
                    social,
                    whale
                },
                signals,
                momentum: this._calculateSentimentMomentum(pair, compositeSentiment),
                timestamp: Date.now()
            };
            
        } catch (error) {
            this.logger.error(`Error analyzing sentiment for ${pair}`, { error: error.message });
            return this._getDefaultSentiment(pair);
        }
    }

    // ============ News Analysis ============
    
    /**
     * @notice Analyze news sentiment using Gaia AI
     * @param {string} asset - Cryptocurrency asset
     * @returns {Object} News sentiment analysis
     */
    async _analyzeNews(asset) {
        try {
            const newsPrompt = `Analyze recent cryptocurrency news sentiment for ${asset}:

            Please evaluate:
            1. Overall news sentiment (very bearish to very bullish)
            2. Key news events and their impact
            3. Regulatory developments
            4. Adoption and partnership news
            5. Technical developments
            6. Market manipulation or FUD detection
            7. Celebrity/influencer mentions
            8. Institutional activity news
            
            Consider the following timeframes:
            - Last 1 hour (immediate impact)
            - Last 6 hours (short-term impact)  
            - Last 24 hours (medium-term impact)
            
            Provide response in JSON format:
            {
                "overallSentiment": 0.0-1.0,
                "confidence": 0.0-1.0,
                "trend": "BULLISH" | "BEARISH" | "NEUTRAL",
                "keyEvents": [
                    {
                        "headline": "string",
                        "impact": 0.0-1.0,
                        "category": "REGULATION|ADOPTION|TECHNOLOGY|MARKET|CELEBRITY|FUD",
                        "timeframe": "1h|6h|24h"
                    }
                ],
                "riskFactors": ["factor1", "factor2"],
                "catalysts": ["catalyst1", "catalyst2"]
            }`;
            
            const analysis = await this.gaia.chat({
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are an expert cryptocurrency news analyst with access to real-time news feeds, social media, and market data. Focus on factual analysis and impact assessment.' 
                    },
                    { role: 'user', content: newsPrompt }
                ]
            });
            
            const parsedNews = this._parseGaiaResponse(analysis);
            
            // Cache news data
            this.newsCache.set(Date.now(), {
                asset,
                analysis: parsedNews,
                timestamp: Date.now()
            });
            
            return {
                sentiment: parsedNews.overallSentiment || 0.5,
                confidence: parsedNews.confidence || 0.5,
                trend: parsedNews.trend || 'NEUTRAL',
                impact: this._calculateNewsImpact(parsedNews.keyEvents || []),
                events: parsedNews.keyEvents || [],
                riskFactors: parsedNews.riskFactors || [],
                catalysts: parsedNews.catalysts || []
            };
            
        } catch (error) {
            this.logger.error(`Failed to analyze news for ${asset}`, { error: error.message });
            return this._getDefaultNews();
        }
    }
    
    /**
     * @notice Calculate weighted news impact score
     * @param {Array} events - News events array
     * @returns {number} Weighted impact score
     */
    _calculateNewsImpact(events) {
        if (!events || events.length === 0) return 0.5;
        
        let totalImpact = 0;
        let totalWeight = 0;
        
        for (const event of events) {
            const categoryWeight = NEWS_IMPACT_WEIGHTS[event.category] || 0.5;
            const timeWeight = event.timeframe === '1h' ? 1.0 : 
                             event.timeframe === '6h' ? 0.8 : 0.6;
            
            const eventWeight = categoryWeight * timeWeight;
            totalImpact += event.impact * eventWeight;
            totalWeight += eventWeight;
        }
        
        return totalWeight > 0 ? totalImpact / totalWeight : 0.5;
    }

    // ============ Social Media Analysis ============
    
    /**
     * @notice Analyze social media sentiment using Gaia AI
     * @param {string} asset - Cryptocurrency asset
     * @returns {Object} Social sentiment analysis
     */
    async _analyzeSocialSentiment(asset) {
        try {
            const socialPrompt = `Analyze social media sentiment for ${asset} across platforms:

            Evaluate sentiment from:
            1. Twitter/X mentions and trending topics
            2. Reddit discussions (r/cryptocurrency, asset-specific subreddits)
            3. Telegram groups and channels
            4. Discord communities
            5. YouTube content and comments
            6. TikTok crypto content
            
            Focus on:
            - Overall sentiment polarity
            - Volume of mentions (buzz level)
            - Influencer sentiment
            - Community sentiment
            - FUD vs FOMO detection
            - Meme and viral content impact
            - Technical analysis discussions
            - Price prediction sentiment
            
            Timeframes:
            - Last 1 hour (immediate buzz)
            - Last 6 hours (trending momentum)
            
            Provide response in JSON format:
            {
                "overallSentiment": 0.0-1.0,
                "confidence": 0.0-1.0,
                "buzzLevel": 0.0-1.0,
                "trend": "INCREASING" | "DECREASING" | "STABLE",
                "platforms": {
                    "twitter": {"sentiment": 0.0-1.0, "volume": 0.0-1.0},
                    "reddit": {"sentiment": 0.0-1.0, "volume": 0.0-1.0},
                    "telegram": {"sentiment": 0.0-1.0, "volume": 0.0-1.0}
                },
                "influencerSentiment": 0.0-1.0,
                "communitySentiment": 0.0-1.0,
                "fearGreedIndex": 0.0-1.0,
                "viralContent": ["content1", "content2"],
                "dominantThemes": ["theme1", "theme2"]
            }`;
            
            const analysis = await this.gaia.chat({
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are a social media sentiment analyst specializing in cryptocurrency communities. You have access to real-time social media data across all major platforms.' 
                    },
                    { role: 'user', content: socialPrompt }
                ]
            });
            
            const parsedSocial = this._parseGaiaResponse(analysis);
            
            // Cache social data
            this.socialCache.set(asset, {
                analysis: parsedSocial,
                timestamp: Date.now()
            });
            
            return {
                sentiment: parsedSocial.overallSentiment || 0.5,
                confidence: parsedSocial.confidence || 0.5,
                buzzLevel: parsedSocial.buzzLevel || 0.5,
                trend: parsedSocial.trend || 'STABLE',
                platforms: parsedSocial.platforms || {},
                influencer: parsedSocial.influencerSentiment || 0.5,
                community: parsedSocial.communitySentiment || 0.5,
                fearGreed: parsedSocial.fearGreedIndex || 0.5,
                viral: parsedSocial.viralContent || [],
                themes: parsedSocial.dominantThemes || []
            };
            
        } catch (error) {
            this.logger.error(`Failed to analyze social sentiment for ${asset}`, { error: error.message });
            return this._getDefaultSocial();
        }
    }

    // ============ Whale Activity Analysis ============
    
    /**
     * @notice Analyze whale activity and its sentiment impact
     * @param {string} asset - Cryptocurrency asset
     * @returns {Object} Whale activity sentiment analysis
     */
    async _analyzeWhaleActivity(asset) {
        try {
            const whalePrompt = `Analyze whale activity and large holder sentiment for ${asset}:

            Evaluate:
            1. Large transaction analysis (>$1M moves)
            2. Exchange inflows/outflows from whales
            3. Whale accumulation vs distribution patterns
            4. Smart money movements
            5. Institutional activity indicators
            6. Wallet concentration changes
            7. On-chain metrics sentiment
            8. Derivative positions by large players
            
            Consider timeframes:
            - Last 1 hour (immediate moves)
            - Last 6 hours (short-term positioning)
            - Last 24 hours (strategic positioning)
            
            Provide response in JSON format:
            {
                "whaleSentiment": 0.0-1.0,
                "confidence": 0.0-1.0,
                "activity": "HIGH" | "MEDIUM" | "LOW",
                "netFlow": "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL",
                "largeTransactions": {
                    "count": number,
                    "netSentiment": 0.0-1.0
                },
                "exchangeFlows": {
                    "inflows": 0.0-1.0,
                    "outflows": 0.0-1.0,
                    "net": "BULLISH" | "BEARISH" | "NEUTRAL"
                },
                "smartMoney": {
                    "sentiment": 0.0-1.0,
                    "activity": "BUYING" | "SELLING" | "HOLDING"
                },
                "riskLevel": "HIGH" | "MEDIUM" | "LOW"
            }`;
            
            const analysis = await this.gaia.chat({
                messages: [
                    { 
                        role: 'system', 
                        content: 'You are a blockchain analyst specializing in whale activity and large holder behavior. You have access to on-chain data, exchange flows, and derivative markets.' 
                    },
                    { role: 'user', content: whalePrompt }
                ]
            });
            
            const parsedWhale = this._parseGaiaResponse(analysis);
            
            return {
                sentiment: parsedWhale.whaleSentiment || 0.5,
                confidence: parsedWhale.confidence || 0.5,
                activity: parsedWhale.activity || 'MEDIUM',
                netFlow: parsedWhale.netFlow || 'NEUTRAL',
                transactions: parsedWhale.largeTransactions || { count: 0, netSentiment: 0.5 },
                exchangeFlows: parsedWhale.exchangeFlows || { net: 'NEUTRAL' },
                smartMoney: parsedWhale.smartMoney || { sentiment: 0.5, activity: 'HOLDING' },
                riskLevel: parsedWhale.riskLevel || 'MEDIUM'
            };
            
        } catch (error) {
            this.logger.error(`Failed to analyze whale activity for ${asset}`, { error: error.message });
            return this._getDefaultWhale();
        }
    }

    // ============ Sentiment Calculation ============
    
    /**
     * @notice Calculate composite sentiment from all sources
     * @param {Object} news - News sentiment data
     * @param {Object} social - Social sentiment data
     * @param {Object} whale - Whale activity data
     * @returns {Object} Composite sentiment analysis
     */
    _calculateCompositeSentiment(news, social, whale) {
        try {
            // ============ Weighted Sentiment Calculation ============
            const weightedScore = 
                (news.sentiment * this.weights.news) +
                (social.sentiment * this.weights.social) +
                (whale.sentiment * this.weights.whale) +
                (0.5 * this.weights.technical); // Technical placeholder
            
            // ============ Confidence Calculation ============
            const avgConfidence = (news.confidence + social.confidence + whale.confidence) / 3;
            const confidenceAdjustment = this._calculateConfidenceAdjustment(news, social, whale);
            const finalConfidence = Math.min(1.0, avgConfidence * confidenceAdjustment);
            
            // ============ Trend Determination ============
            const trend = this._determineSentimentTrend(weightedScore, news, social, whale);
            
            // ============ Momentum Calculation ============
            const momentum = this._calculateCurrentMomentum(news, social, whale);
            
            return {
                score: Math.max(0, Math.min(1, weightedScore)),
                confidence: finalConfidence,
                trend,
                momentum,
                strength: this._categorizeSentimentStrength(weightedScore),
                components: {
                    newsWeight: this.weights.news,
                    socialWeight: this.weights.social,
                    whaleWeight: this.weights.whale
                }
            };
            
        } catch (error) {
            this.logger.error('Error calculating composite sentiment', { error: error.message });
            return {
                score: 0.5,
                confidence: 0.3,
                trend: 'NEUTRAL',
                momentum: 0,
                strength: 'NEUTRAL'
            };
        }
    }
    
    /**
     * @notice Generate trading signals from sentiment analysis
     * @param {Object} sentiment - Composite sentiment data
     * @param {string} pair - Trading pair
     * @returns {Object} Trading signals
     */
    _generateSentimentSignals(sentiment, pair) {
        try {
            const signals = {
                direction: 'HOLD',
                strength: 0,
                timeHorizon: 'SHORT',
                confidence: sentiment.confidence,
                reasons: []
            };
            
            // ============ Direction Determination ============
            if (sentiment.score > 0.7 && sentiment.confidence > 0.6) {
                signals.direction = 'BUY';
                signals.strength = (sentiment.score - 0.5) * 2;
                signals.reasons.push('Strong bullish sentiment');
            } else if (sentiment.score < 0.3 && sentiment.confidence > 0.6) {
                signals.direction = 'SELL';
                signals.strength = (0.5 - sentiment.score) * 2;
                signals.reasons.push('Strong bearish sentiment');
            }
            
            // ============ Momentum Adjustment ============
            if (Math.abs(sentiment.momentum) > 0.3) {
                signals.strength *= (1 + Math.abs(sentiment.momentum));
                signals.reasons.push(`${sentiment.momentum > 0 ? 'Positive' : 'Negative'} momentum`);
            }
            
            // ============ Time Horizon ============
            if (sentiment.components.newsWeight > 0.5) {
                signals.timeHorizon = 'MEDIUM';
            }
            if (sentiment.components.whaleWeight > 0.3) {
                signals.timeHorizon = 'LONG';
            }
            
            return signals;
            
        } catch (error) {
            this.logger.error('Error generating sentiment signals', { error: error.message });
            return {
                direction: 'HOLD',
                strength: 0,
                timeHorizon: 'SHORT',
                confidence: 0.3,
                reasons: ['Analysis error']
            };
        }
    }

    // ============ Utility Methods ============
    
    /**
     * @notice Calculate sentiment momentum for a trading pair
     * @param {string} pair - Trading pair
     * @param {Object} currentSentiment - Current sentiment data
     * @returns {number} Momentum score (-1 to 1)
     */
    _calculateSentimentMomentum(pair, currentSentiment) {
        try {
            const history = this.sentimentHistory.get(pair);
            if (!history || history.length < 3) return 0;
            
            const recent = history.slice(-3);
            const momentum = (currentSentiment.score - recent[0].score) / 2;
            
            return Math.max(-1, Math.min(1, momentum));
            
        } catch (error) {
            this.logger.error('Error calculating sentiment momentum', { error: error.message });
            return 0;
        }
    }
    
    /**
     * @notice Update sentiment history for tracking
     * @param {string} pair - Trading pair
     * @param {Object} sentiment - Sentiment data
     */
    _updateSentimentHistory(pair, sentiment) {
        try {
            if (!this.sentimentHistory.has(pair)) {
                this.sentimentHistory.set(pair, []);
            }
            
            const history = this.sentimentHistory.get(pair);
            history.push({
                score: sentiment.score,
                confidence: sentiment.confidence,
                timestamp: Date.now()
            });
            
            // Keep only recent history
            if (history.length > this.config.historyLength) {
                history.splice(0, history.length - this.config.historyLength);
            }
            
        } catch (error) {
            this.logger.error('Error updating sentiment history', { error: error.message });
        }
    }
    
    /**
     * @notice Parse Gaia AI response into structured data
     * @param {string} response - Raw AI response
     * @returns {Object} Parsed structured data
     */
    _parseGaiaResponse(response) {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            // Fallback parsing for non-JSON responses
            return this._parseTextResponse(response);
            
        } catch (error) {
            this.logger.warn('Failed to parse Gaia response', { response, error: error.message });
            return {};
        }
    }
    
    /**
     * @notice Parse text response when JSON parsing fails
     * @param {string} response - Text response
     * @returns {Object} Extracted data
     */
    _parseTextResponse(response) {
        const parsed = {
            overallSentiment: 0.5,
            confidence: 0.3
        };
        
        // Extract sentiment keywords
        const bullishWords = ['bullish', 'positive', 'optimistic', 'good', 'strong'];
        const bearishWords = ['bearish', 'negative', 'pessimistic', 'bad', 'weak'];
        
        const lowerResponse = response.toLowerCase();
        const bullishCount = bullishWords.filter(word => lowerResponse.includes(word)).length;
        const bearishCount = bearishWords.filter(word => lowerResponse.includes(word)).length;
        
        if (bullishCount > bearishCount) {
            parsed.overallSentiment = 0.6 + (bullishCount * 0.1);
            parsed.trend = 'BULLISH';
        } else if (bearishCount > bullishCount) {
            parsed.overallSentiment = 0.4 - (bearishCount * 0.1);
            parsed.trend = 'BEARISH';
        }
        
        return parsed;
    }

    // ============ Default Values ============
    
    _getDefaultSentiment(pair) {
        return {
            pair,
            score: 0.5,
            confidence: 0.3,
            trend: 'NEUTRAL',
            components: {
                news: this._getDefaultNews(),
                social: this._getDefaultSocial(),
                whale: this._getDefaultWhale()
            },
            signals: {
                direction: 'HOLD',
                strength: 0,
                confidence: 0.3
            },
            momentum: 0,
            timestamp: Date.now()
        };
    }
    
    _getDefaultNews() {
        return {
            sentiment: 0.5,
            confidence: 0.3,
            trend: 'NEUTRAL',
            impact: 0.5,
            events: [],
            riskFactors: [],
            catalysts: []
        };
    }
    
    _getDefaultSocial() {
        return {
            sentiment: 0.5,
            confidence: 0.3,
            buzzLevel: 0.3,
            trend: 'STABLE',
            platforms: {},
            influencer: 0.5,
            community: 0.5,
            fearGreed: 0.5,
            viral: [],
            themes: []
        };
    }
    
    _getDefaultWhale() {
        return {
            sentiment: 0.5,
            confidence: 0.3,
            activity: 'MEDIUM',
            netFlow: 'NEUTRAL',
            transactions: { count: 0, netSentiment: 0.5 },
            exchangeFlows: { net: 'NEUTRAL' },
            smartMoney: { sentiment: 0.5, activity: 'HOLDING' },
            riskLevel: 'MEDIUM'
        };
    }

    // ============ Public Methods ============
    
    /**
     * @notice Get sentiment summary for all monitored pairs
     * @returns {Object} Sentiment summary
     */
    getSentimentSummary() {
        const summary = {
            timestamp: Date.now(),
            pairs: {},
            overall: {
                averageSentiment: 0,
                bullishPairs: 0,
                bearishPairs: 0,
                neutralPairs: 0
            }
        };
        
        let totalSentiment = 0;
        let pairCount = 0;
        
        for (const [pair, data] of this.sentimentCache) {
            summary.pairs[pair] = {
                score: data.score,
                confidence: data.confidence,
                trend: data.trend
            };
            
            totalSentiment += data.score;
            pairCount++;
            
            if (data.score > 0.6) summary.overall.bullishPairs++;
            else if (data.score < 0.4) summary.overall.bearishPairs++;
            else summary.overall.neutralPairs++;
        }
        
        summary.overall.averageSentiment = pairCount > 0 ? totalSentiment / pairCount : 0.5;
        
        return summary;
    }
    
    /**
     * @notice Clear all cached data
     */
    clearCache() {
        this.sentimentCache.clear();
        this.newsCache.clear();
        this.socialCache.clear();
        this.logger.info('Sentiment cache cleared');
    }
}