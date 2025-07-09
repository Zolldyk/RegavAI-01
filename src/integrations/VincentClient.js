// ============ Imports ============
import { getVincentToolClient, getVincentWebAppClient, jwt } from '@lit-protocol/vincent-app-sdk';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import config from '../utils/Config.js';
import logger from '../utils/Logger.js';
import { v4 as uuidv4 } from 'uuid';

// ============ Constants ============
const POLICY_TYPES = {
    SPENDING_LIMIT: 'SPENDING_LIMIT',
    TIME_RESTRICTION: 'TIME_RESTRICTION',
    TRADE_FREQUENCY: 'TRADE_FREQUENCY',
    TOKEN_ALLOWLIST: 'TOKEN_ALLOWLIST'
};

const VIOLATION_TYPES = {
    PER_TRADE_LIMIT_EXCEEDED: 'PER_TRADE_LIMIT_EXCEEDED',
    DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
    TIME_RESTRICTION_VIOLATED: 'TIME_RESTRICTION_VIOLATED',
    FREQUENCY_LIMIT_EXCEEDED: 'FREQUENCY_LIMIT_EXCEEDED',
    TOKEN_NOT_ALLOWED: 'TOKEN_NOT_ALLOWED'
};

const CACHE_TIMEOUT = 300000; // 5 minutes
const MAX_VIOLATIONS_HISTORY = 100;
const MONITORING_INTERVAL = 60000; // 1 minute

/**
 * @title Vincent Permission Client
 * @author Regav-AI Team
 * @notice Secure permission management for AI agent trading using Vincent (Lit Protocol)
 * @dev Handles user consent, policy enforcement, and secure trade authorization for Recall hackathon
 */
class VincentClient extends EventEmitter {
    constructor() {
        super();
        
        // ============ Configuration ============
        this.config = config.getVincentConfig();
        this.tradingConfig = config.getTradingConfig();
        
        // ============ Client State ============
        this.isInitialized = false;
        this.toolClient = null;
        this.webAppClient = null;
        this.ethersSigner = null;
        this.currentUserJWT = null;
        this.currentUserInfo = null;
        
        // ============ Policy Management ============
        this.activePolicies = new Map();
        this.policyViolations = [];
        this.spendingLimits = {
            daily: {
                limit: this.config.dailySpendingLimit || 1000, // $1000 default
                spent: 0,
                resetTime: this._getNextDayReset()
            },
            perTrade: {
                limit: this.config.maxTradeAmount || 100 // $100 default per trade
            },
            hourly: {
                limit: this.config.hourlySpendingLimit || 500, // $500 per hour
                spent: 0,
                resetTime: this._getNextHourReset()
            }
        };
        
        // ============ Permission Cache ============
        this.permissionCache = new Map();
        this.cacheTimeout = CACHE_TIMEOUT;
        
        // ============ Trade Tracking ============
        this.tradeHistory = [];
        this.recentTrades = [];
        
        // ============ Usage Statistics ============
        this.usageStats = {
            totalRequests: 0,
            approvedRequests: 0,
            deniedRequests: 0,
            totalSpent: 0,
            avgProcessingTime: 0,
            tradesPerHour: 0,
            lastResetTime: Date.now()
        };

        // ============ Performance Timers ============
        this.timers = new Map();
    }

    // ============ Initialization ============

    /**
     * @notice Initialize Vincent client with encrypted wallet and policies
     * @dev Sets up secure connection to Lit Protocol and initializes policies for competition
     */
    async initialize() {
        const timer = logger.createPerformanceTimer('vincent_initialization');
        
        try {
            logger.info('Initializing Vincent permission client...', {
                appId: this.config.appId,
                appVersion: this.config.appVersion,
                litNetwork: this.config.litNetwork || 'datil-dev'
            });

            // ============ Validate Configuration ============
            this._validateConfiguration();

            // ============ Initialize Ethers Signer ============
            await this._initializeEthersSigner();

            // ============ Initialize Vincent Tool Client ============
            await this._initializeToolClient();

            // ============ Initialize Web App Client ============
            this._initializeWebAppClient();

            // ============ Load Competition Policies ============
            await this._initializeCompetitionPolicies();

            // ============ Start Policy Monitoring ============
            this._startPolicyMonitoring();

            // ============ Setup Event Handlers ============
            this._setupEventHandlers();

            this.isInitialized = true;
            this.emit('initialized');

            const initTime = timer();
            logger.logVincentOperation('INITIALIZE', {
                success: true,
                appId: this.config.appId,
                policiesLoaded: this.activePolicies.size,
                initializationTime: initTime
            });

            return {
                success: true,
                initializationTime: initTime,
                delegateeAddress: this.ethersSigner.address,
                activePolicies: this.activePolicies.size
            };

        } catch (error) {
            const initTime = timer();
            logger.error('Failed to initialize Vincent client', {
                error: error.message,
                stack: error.stack,
                initializationTime: initTime
            });
            
            this.emit('error', error);
            throw new Error(`Vincent initialization failed: ${error.message}`);
        }
    }

    /**
     * @notice Validate Vincent configuration for competition requirements
     * @dev Ensures all required configuration is present and valid for 1-hour competition
     */
    _validateConfiguration() {
        const required = [
            'appId', 
            'appVersion', 
            'delegateeWalletName', 
            'maxTradeAmount', 
            'dailySpendingLimit'
        ];
        
        const missing = required.filter(field => !this.config[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required Vincent configuration: ${missing.join(', ')}`);
        }

        // ============ Validate Competition-Specific Limits ============
        if (this.config.maxTradeAmount <= 0 || this.config.dailySpendingLimit <= 0) {
            throw new Error('Vincent spending limits must be positive numbers');
        }

        if (this.config.maxTradeAmount > this.config.dailySpendingLimit) {
            throw new Error('Max trade amount cannot exceed daily spending limit');
        }

        // ============ Validate Competition Time Limits ============
        const competitionDuration = 3600000; // 1 hour in milliseconds
        if (this.config.dailySpendingLimit < this.config.maxTradeAmount * 50) {
            logger.warn('Daily spending limit may be too low for high-frequency trading competition');
        }

        logger.debug('Vincent configuration validated', {
            maxTradeAmount: this.config.maxTradeAmount,
            dailySpendingLimit: this.config.dailySpendingLimit,
            competitionMode: true
        });
    }

    /**
     * @notice Initialize ethers signer using encrypted wallet via Foundry cast
     * @dev Securely loads delegatee private key using cast wallet import methodology
     */
    async _initializeEthersSigner() {
        try {
            logger.debug('Loading delegatee credentials via Foundry cast...');
            
            // ============ Load Encrypted Delegatee Wallet ============
            const { privateKey, address } = await this._loadDelegateeCredentials();

            // ============ Create Ethers Signer ============
            this.ethersSigner = new ethers.Wallet(privateKey);

            // ============ Verify Address Match ============
            if (this.ethersSigner.address.toLowerCase() !== address.toLowerCase()) {
                throw new Error('Address mismatch between cast wallet and ethers signer');
            }

            logger.info('Vincent delegatee signer initialized', {
                address: this.ethersSigner.address,
                network: this.config.litNetwork || 'datil-dev'
            });

        } catch (error) {
            logger.error('Failed to initialize delegatee signer', {
                error: error.message,
                walletName: this.config.delegateeWalletName
            });
            throw new Error(`Delegatee signer initialization failed: ${error.message}`);
        }
    }

    /**
     * @notice Load delegatee credentials using Foundry cast
     * @dev Securely retrieves encrypted private key for delegatee account
     * @return {Object} Delegatee credentials with private key and address
     */
    async _loadDelegateeCredentials() {
        const execAsync = promisify(exec);
        
        try {
            const walletName = this.config.delegateeWalletName;
            const walletConfig = config.getWalletConfig();
            
            // ============ Get Private Key from Encrypted Wallet ============
            const privateKeyCmd = walletConfig.passwordFile 
                ? `cast wallet private-key ${walletName} --password-file ${walletConfig.passwordFile}`
                : `cast wallet private-key ${walletName} --interactive`;

            const { stdout: privateKey, stderr: pkError } = await execAsync(privateKeyCmd);
            
            if (pkError) {
                throw new Error(`Failed to get private key: ${pkError}`);
            }

            // ============ Get Address from Wallet ============
            const { stdout: address, stderr: addrError } = await execAsync(
                `cast wallet address ${walletName}`
            );
            
            if (addrError) {
                throw new Error(`Failed to get wallet address: ${addrError}`);
            }

            // ============ Validate Credentials ============
            const cleanPrivateKey = privateKey.trim();
            const cleanAddress = address.trim();

            if (!cleanPrivateKey.startsWith('0x') || cleanPrivateKey.length !== 66) {
                throw new Error('Invalid private key format from cast wallet');
            }

            if (!cleanAddress.startsWith('0x') || cleanAddress.length !== 42) {
                throw new Error('Invalid address format from cast wallet');
            }

            logger.debug('Delegatee credentials loaded successfully', {
                walletName,
                address: cleanAddress
            });

            return {
                privateKey: cleanPrivateKey,
                address: cleanAddress
            };

        } catch (error) {
            logger.error('Failed to load delegatee credentials', {
                error: error.message,
                walletName: this.config.delegateeWalletName
            });
            
            throw new Error(
                `Cannot load delegatee wallet "${this.config.delegateeWalletName}". ` +
                'Ensure wallet is imported with: cast wallet import <name> --interactive'
            );
        }
    }

    /**
     * @notice Initialize Vincent tool client for competition trading
     * @dev Sets up tool client for executing ERC20 transfers with spending limit policies
     */
    async _initializeToolClient() {
        try {
            logger.debug('Initializing Vincent tool client...');
            
            // ============ Load Vincent Trading Tool ============
            const bundledVincentTool = await this._loadVincentTradingTool();

            // ============ Create Tool Client ============
            this.toolClient = getVincentToolClient({
                bundledVincentTool,
                ethersSigner: this.ethersSigner
            });

            logger.info('Vincent tool client initialized successfully', {
                toolType: bundledVincentTool.vincentTool.name,
                supportedPolicies: bundledVincentTool.vincentTool.supportedPolicies
            });

        } catch (error) {
            logger.error('Failed to initialize Vincent tool client', {
                error: error.message
            });
            throw new Error(`Tool client initialization failed: ${error.message}`);
        }
    }

    /**
     * @notice Load Vincent trading tool configuration for competition
     * @dev Configures ERC20 transfer tool with spending limit and time restriction policies
     * @return {Object} Bundled Vincent tool ready for competition use
     */
    async _loadVincentTradingTool() {
        try {
            // ============ Import Actual Vincent Tool ============
            // Note: This would import from actual Vincent tool packages
            // For competition, we need ERC20 transfer tool with spending limits
            
            // Example structure based on Vincent documentation:
            const bundledTool = {
                vincentTool: {
                    name: 'erc20-trading-tool',
                    packageName: '@regav-ai/vincent-tool-erc20-trading',
                    toolParamsSchema: {
                        type: 'object',
                        properties: {
                            tokenAddress: { type: 'string' },
                            amount: { type: 'number' },
                            recipientAddress: { type: 'string' },
                            reason: { type: 'string' }
                        },
                        required: ['tokenAddress', 'amount', 'recipientAddress', 'reason']
                    },
                    supportedPolicies: [
                        'spending-limit-policy',
                        'time-restriction-policy',
                        'token-allowlist-policy'
                    ],
                    // Tool would have precheck and execute functions
                    precheck: async () => ({ success: true }),
                    execute: async () => ({ success: true })
                },
                ipfsCid: 'QmVincentTradingTool123' // IPFS CID of deployed tool
            };

            logger.debug('Vincent trading tool loaded', {
                toolName: bundledTool.vincentTool.name,
                supportedPolicies: bundledTool.vincentTool.supportedPolicies,
                ipfsCid: bundledTool.ipfsCid
            });

            return bundledTool;

        } catch (error) {
            logger.error('Failed to load Vincent trading tool', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * @notice Initialize web app client for user consent management
     * @dev Sets up client for managing user authorization flows during competition
     */
    _initializeWebAppClient() {
        try {
            this.webAppClient = getVincentWebAppClient({
                appId: this.config.appId.toString()
            });

            logger.info('Vincent web app client initialized', {
                appId: this.config.appId
            });

        } catch (error) {
            logger.error('Failed to initialize web app client', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * @notice Initialize competition-specific policies
     * @dev Sets up aggressive policies optimized for 1-hour high-frequency trading competition
     */
    async _initializeCompetitionPolicies() {
        try {
            logger.debug('Initializing competition policies...');

            // ============ Competition Spending Policy ============
            const competitionSpendingPolicy = {
                id: 'competition-spending-policy',
                type: POLICY_TYPES.SPENDING_LIMIT,
                name: 'Competition Spending Limits',
                config: {
                    dailyLimit: this.config.dailySpendingLimit,
                    perTradeLimit: this.config.maxTradeAmount,
                    hourlyLimit: this.config.hourlySpendingLimit || (this.config.dailySpendingLimit * 0.5),
                    resetHour: 0, // Reset at midnight UTC
                    competitionMode: true
                },
                isActive: true,
                createdAt: Date.now()
            };

            // ============ High-Frequency Trading Policy ============
            const highFrequencyPolicy = {
                id: 'high-frequency-trading-policy',
                type: POLICY_TYPES.TRADE_FREQUENCY,
                name: 'High-Frequency Trading Limits',
                config: {
                    maxTradesPerMinute: this.tradingConfig.maxTradesPerMinute || 5,
                    maxTradesPerHour: this.tradingConfig.maxTradesPerHour || 200,
                    minTimeBetweenTrades: this.tradingConfig.minTimeBetweenTrades || 2000, // 2 seconds
                    competitionMode: true
                },
                isActive: true,
                createdAt: Date.now()
            };

            // ============ Competition Time Policy ============
            const competitionTimePolicy = {
                id: 'competition-time-policy',
                type: POLICY_TYPES.TIME_RESTRICTION,
                name: 'Competition Time Restrictions',
                config: {
                    maxExpiryMinutes: this.config.tradeExpiryMinutes || 10,
                    allowedHours: { start: 0, end: 24 }, // 24/7 for competition
                    competitionStartTime: Date.now(),
                    competitionDuration: 3600000, // 1 hour
                    emergencyStopEnabled: true
                },
                isActive: true,
                createdAt: Date.now()
            };

            // ============ Token Allowlist Policy ============
            const tokenAllowlistPolicy = {
                id: 'token-allowlist-policy',
                type: POLICY_TYPES.TOKEN_ALLOWLIST,
                name: 'Competition Token Allowlist',
                config: {
                    allowedTokens: this.tradingConfig.allowedTokens || [
                        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
                        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
                        '0x6B175474E89094C44Da98b954EedeAC495271d0F'  // DAI
                    ],
                    strictMode: false, // Allow other tokens with warnings
                    competitionPairs: this.tradingConfig.tradingPairs || [
                        'BTC/USDT', 'ETH/USDT', 'SOL/USDC'
                    ]
                },
                isActive: true,
                createdAt: Date.now()
            };

            // ============ Store Active Policies ============
            this.activePolicies.set(competitionSpendingPolicy.id, competitionSpendingPolicy);
            this.activePolicies.set(highFrequencyPolicy.id, highFrequencyPolicy);
            this.activePolicies.set(competitionTimePolicy.id, competitionTimePolicy);
            this.activePolicies.set(tokenAllowlistPolicy.id, tokenAllowlistPolicy);

            logger.logVincentOperation('COMPETITION_POLICIES_INITIALIZED', {
                totalPolicies: this.activePolicies.size,
                policyTypes: Array.from(this.activePolicies.values()).map(p => p.type),
                competitionMode: true,
                spendingLimits: {
                    daily: this.config.dailySpendingLimit,
                    perTrade: this.config.maxTradeAmount,
                    hourly: this.config.hourlySpendingLimit
                }
            });

        } catch (error) {
            logger.error('Failed to initialize competition policies', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * @notice Setup event handlers for Vincent client
     * @dev Configures event handlers for monitoring and debugging
     */
    _setupEventHandlers() {
        // ============ Policy Violation Handler ============
        this.on('policy_violation', (violation) => {
            logger.warn('Policy violation detected', {
                policyId: violation.policyId,
                violationType: violation.violationType,
                reason: violation.reason
            });
        });

        // ============ Spending Update Handler ============
        this.on('spending_updated', (update) => {
            logger.info('Spending limits updated', {
                amount: update.amount,
                dailySpent: update.dailySpent,
                dailyRemaining: update.dailyRemaining
            });
        });

        // ============ Daily Limit Reset Handler ============
        this.on('daily_limit_reset', (reset) => {
            logger.info('Daily spending limit reset', {
                previousSpent: reset.previousSpent,
                newLimit: reset.newLimit
            });
        });

        // ============ User Consent Handler ============
        this.on('user_consented', (userInfo) => {
            logger.info('User consent completed', {
                pkpAddress: userInfo.pkpAddress,
                appId: userInfo.appId,
                authMethod: userInfo.authMethod.type
            });
        });
    }

    // ============ Permission Management ============

    /**
     * @notice Request permission to execute a trade with competition optimizations
     * @param {Object} tradeParams Trade parameters requiring permission
     * @return {Object} Permission result with approval status and competition metrics
     */
    async requestTradePermission(tradeParams) {
        const timer = logger.createPerformanceTimer('vincent_permission_check');
        const requestId = uuidv4();

        try {
            logger.logVincentOperation('PERMISSION_REQUEST', {
                requestId,
                tradeParams: {
                    pair: tradeParams.pair,
                    action: tradeParams.action,
                    amount: tradeParams.amount,
                    competitionMode: true
                }
            });

            // ============ Competition Speed Optimization ============
            // Check cache first for speed in high-frequency trading
            const cacheKey = this._generateCacheKey(tradeParams);
            const cachedResult = this._getCachedPermission(cacheKey);
            
            if (cachedResult && this._isCacheValidForCompetition(cachedResult)) {
                logger.debug('Using cached permission result', { 
                    requestId, 
                    cacheKey,
                    competitionOptimization: true 
                });
                return cachedResult;
            }

            // ============ Validate Trade Parameters ============
            this._validateTradeParams(tradeParams);

            // ============ Competition Policy Precheck ============
            const precheckResult = await this._runCompetitionPolicyPrecheck(tradeParams);
            
            if (!precheckResult.success) {
                const deniedResult = {
                    success: false,
                    requestId,
                    reason: precheckResult.reason,
                    violatedPolicies: precheckResult.violatedPolicies,
                    competitionMode: true,
                    timestamp: Date.now()
                };

                this._updateUsageStats(false, timer());
                this._recordPolicyViolation(deniedResult);
                
                return deniedResult;
            }

            // ============ Execute Vincent Permission Check ============
            const permissionResult = await this._executeVincentPermissionCheck(tradeParams, requestId);

            // ============ Cache Successful Results for Competition Speed ============
            if (permissionResult.success) {
                this._cachePermission(cacheKey, permissionResult);
            }

            // ============ Update Competition Statistics ============
            this._updateUsageStats(permissionResult.success, timer());
            this._trackCompetitionMetrics(tradeParams, permissionResult);

            // ============ Log Competition Performance ============
            logger.logVincentOperation('PERMISSION_RESULT', {
                requestId,
                success: permissionResult.success,
                reason: permissionResult.reason || 'Approved',
                processingTime: timer(),
                competitionMode: true,
                tradesPerMinute: this._calculateTradesPerMinute()
            });

            return permissionResult;

        } catch (error) {
            const errorResult = {
                success: false,
                requestId,
                reason: `Permission check failed: ${error.message}`,
                error: error.message,
                competitionMode: true,
                timestamp: Date.now()
            };

            this._updateUsageStats(false, timer());
            
            logger.error('Vincent permission check failed', {
                requestId,
                error: error.message,
                tradeParams,
                competitionMode: true
            });

            return errorResult;
        }
    }

    /**
     * @notice Execute Vincent permission check via tool client
     * @param {Object} tradeParams Trade parameters
     * @param {string} requestId Request identifier
     * @return {Object} Permission check result with competition optimizations
     */
    async _executeVincentPermissionCheck(tradeParams, requestId) {
        try {
            // ============ Convert Trade Params to Vincent Tool Format ============
            const toolParams = this._convertToVincentToolParams(tradeParams);

            // ============ Get Delegator PKP Address ============
            const delegatorPkpEthAddress = await this._getDelegatorAddress(tradeParams);

            // ============ Execute Precheck via Vincent Tool Client ============
            const precheckResult = await this.toolClient.precheck(toolParams, {
                delegatorPkpEthAddress,
                rpcUrl: this.config.rpcUrl // Optional RPC override
            });

            if (precheckResult.success) {
                return {
                    success: true,
                    requestId,
                    approvedAmount: tradeParams.amount,
                    remainingLimits: this._calculateRemainingLimits(tradeParams.amount),
                    applicablePolicies: this._getApplicablePolicies(tradeParams),
                    competitionMetrics: this._getCompetitionMetrics(),
                    timestamp: Date.now()
                };
            } else {
                return {
                    success: false,
                    requestId,
                    reason: precheckResult.error || 'Policy violation detected',
                    violatedPolicies: this._identifyViolatedPolicies(precheckResult),
                    competitionMode: true,
                    timestamp: Date.now()
                };
            }

        } catch (error) {
            logger.error('Failed to execute Vincent permission check', {
                error: error.message,
                requestId
            });
            throw error;
        }
    }

    /**
     * @notice Execute a trade with Vincent policy enforcement for competition
     * @param {Object} tradeParams Trade parameters
     * @return {Object} Trade execution result with policy commitment and competition metrics
     */
    async executeTradeWithPolicies(tradeParams) {
        const timer = logger.createPerformanceTimer('vincent_trade_execution');
        const executionId = uuidv4();

        try {
            logger.logVincentOperation('TRADE_EXECUTION_START', {
                executionId,
                tradeParams: {
                    pair: tradeParams.pair,
                    action: tradeParams.action,
                    amount: tradeParams.amount
                },
                competitionMode: true
            });

            // ============ Fast Permission Check ============
            const permissionResult = await this.requestTradePermission(tradeParams);
            
            if (!permissionResult.success) {
                throw new Error(`Permission denied: ${permissionResult.reason}`);
            }

            // ============ Prepare Vincent Tool Execution ============
            const toolParams = this._convertToVincentToolParams(tradeParams);
            const delegatorPkpEthAddress = await this._getDelegatorAddress(tradeParams);

            // ============ Execute Trade via Vincent Tool Client ============
            const executeResult = await this.toolClient.execute(toolParams, {
                delegatorPkpEthAddress
            });

            if (executeResult.success) {
                // ============ Commit Spending to Policies ============
                await this._commitTradeSpending(tradeParams);

                // ============ Update Competition Tracking ============
                this._recordCompetitionTrade(tradeParams, executeResult);

                const processingTime = timer();
                
                logger.logVincentOperation('TRADE_EXECUTION_SUCCESS', {
                    executionId,
                    result: executeResult.result,
                    processingTime,
                    spentAmount: tradeParams.amount,
                    competitionMode: true,
                    totalTrades: this.usageStats.totalRequests
                });

                return {
                    success: true,
                    executionId,
                    result: executeResult.result,
                    policyCommitments: this._extractPolicyCommitments(executeResult),
                    updatedLimits: this._getUpdatedSpendingLimits(),
                    competitionMetrics: this._getCompetitionMetrics(),
                    processingTime
                };

            } else {
                throw new Error(executeResult.error || 'Trade execution failed');
            }

        } catch (error) {
            const processingTime = timer();
            
            logger.logVincentOperation('TRADE_EXECUTION_FAILED', {
                executionId,
                error: error.message,
                processingTime,
                competitionMode: true
            });

            throw error;
        }
    }

    // ============ Competition Policy Management ============

    /**
     * @notice Run competition-optimized policy precheck
     * @param {Object} tradeParams Trade parameters
     * @return {Object} Precheck result optimized for high-frequency trading
     */
    async _runCompetitionPolicyPrecheck(tradeParams) {
        const violations = [];

        try {
            // ============ Fast Spending Limit Check ============
            const spendingCheck = this._checkCompetitionSpendingLimits(tradeParams);
            if (!spendingCheck.success) {
                violations.push(spendingCheck);
            }

            // ============ High-Frequency Trading Check ============
            const frequencyCheck = this._checkHighFrequencyLimits(tradeParams);
            if (!frequencyCheck.success) {
                violations.push(frequencyCheck);
            }

            // ============ Competition Time Check ============
            const timeCheck = this._checkCompetitionTimeRestrictions(tradeParams);
            if (!timeCheck.success) {
                violations.push(timeCheck);
            }

            // ============ Token Allowlist Check ============
            const tokenCheck = this._checkTokenAllowlist(tradeParams);
            if (!tokenCheck.success) {
                violations.push(tokenCheck);
            }

            if (violations.length > 0) {
                return {
                    success: false,
                    reason: 'Competition policy violations detected',
                    violatedPolicies: violations,
                    competitionMode: true
                };
            }

            return {
                success: true,
                reason: 'All competition policies passed',
                competitionMode: true
            };

        } catch (error) {
            logger.error('Competition policy precheck failed', {
                error: error.message,
                tradeParams
            });
            return {
                success: false,
                reason: `Policy check error: ${error.message}`,
                competitionMode: true
            };
        }
    }

    /**
     * @notice Check competition spending limits with hourly tracking
     * @param {Object} tradeParams Trade parameters
     * @return {Object} Spending limit check result
     */
    _checkCompetitionSpendingLimits(tradeParams) {
        const amount = tradeParams.amount;
        const currentTime = Date.now();

        // ============ Reset Spending Limits if Needed ============
        this._resetSpendingLimitsIfNeeded(currentTime);

        // ============ Check Per-Trade Limit ============
        if (amount > this.spendingLimits.perTrade.limit) {
            return {
                success: false,
                policyId: 'competition-spending-policy',
                reason: `Trade amount ${amount} exceeds per-trade limit ${this.spendingLimits.perTrade.limit}`,
                violationType: VIOLATION_TYPES.PER_TRADE_LIMIT_EXCEEDED,
                competitionMode: true
            };
        }

        // ============ Check Hourly Limit for Competition ============
        const projectedHourlySpent = this.spendingLimits.hourly.spent + amount;
        if (projectedHourlySpent > this.spendingLimits.hourly.limit) {
            return {
                success: false,
                policyId: 'competition-spending-policy',
                reason: `Trade would exceed hourly limit. Current: ${this.spendingLimits.hourly.spent}, Requested: ${amount}, Limit: ${this.spendingLimits.hourly.limit}`,
                violationType: 'HOURLY_LIMIT_EXCEEDED',
                competitionMode: true
            };
        }

        // ============ Check Daily Limit ============
        const projectedDailySpent = this.spendingLimits.daily.spent + amount;
        if (projectedDailySpent > this.spendingLimits.daily.limit) {
            return {
                success: false,
                policyId: 'competition-spending-policy',
                reason: `Trade would exceed daily limit. Current: ${this.spendingLimits.daily.spent}, Requested: ${amount}, Limit: ${this.spendingLimits.daily.limit}`,
                violationType: VIOLATION_TYPES.DAILY_LIMIT_EXCEEDED,
                competitionMode: true
            };
        }

        return {
            success: true,
            policyId: 'competition-spending-policy',
            remainingDaily: this.spendingLimits.daily.limit - projectedDailySpent,
            remainingHourly: this.spendingLimits.hourly.limit - projectedHourlySpent,
            remainingPerTrade: this.spendingLimits.perTrade.limit,
            competitionMode: true
        };
    }

    /**
     * @notice Check high-frequency trading limits for competition
     * @param {Object} tradeParams Trade parameters
     * @return {Object} Frequency check result
     */
    _checkHighFrequencyLimits(tradeParams) {
        const currentTime = Date.now();
        const oneMinuteAgo = currentTime - 60000;
        const oneHourAgo = currentTime - 3600000;

        // ============ Count Recent Trades ============
        const tradesLastMinute = this._countRecentTrades(oneMinuteAgo);
        const tradesLastHour = this._countRecentTrades(oneHourAgo);

        const frequencyPolicy = this.activePolicies.get('high-frequency-trading-policy');
        const maxPerMinute = frequencyPolicy.config.maxTradesPerMinute;
        const maxPerHour = frequencyPolicy.config.maxTradesPerHour;

        // ============ Check Per-Minute Limit ============
        if (tradesLastMinute >= maxPerMinute) {
            return {
                success: false,
                policyId: 'high-frequency-trading-policy',
                reason: `Trade frequency limit exceeded: ${tradesLastMinute}/${maxPerMinute} per minute`,
                violationType: VIOLATION_TYPES.FREQUENCY_LIMIT_EXCEEDED,
                competitionMode: true
            };
        }

        // ============ Check Per-Hour Limit ============
        if (tradesLastHour >= maxPerHour) {
            return {
                success: false,
                policyId: 'high-frequency-trading-policy',
                reason: `Hourly trade limit exceeded: ${tradesLastHour}/${maxPerHour} per hour`,
                violationType: VIOLATION_TYPES.FREQUENCY_LIMIT_EXCEEDED,
                competitionMode: true
            };
        }

        // ============ Check Minimum Time Between Trades ============
        const lastTradeTime = this._getLastTradeTime();
        const timeSinceLastTrade = currentTime - lastTradeTime;
        const minTimeBetween = frequencyPolicy.config.minTimeBetweenTrades;

        if (lastTradeTime > 0 && timeSinceLastTrade < minTimeBetween) {
            return {
                success: false,
                policyId: 'high-frequency-trading-policy',
                reason: `Minimum time between trades not met: ${timeSinceLastTrade}ms < ${minTimeBetween}ms`,
                violationType: 'MIN_TIME_VIOLATION',
                competitionMode: true
            };
        }

        return {
            success: true,
            policyId: 'high-frequency-trading-policy',
            remainingPerMinute: maxPerMinute - tradesLastMinute,
            remainingPerHour: maxPerHour - tradesLastHour,
            timeSinceLastTrade,
            competitionMode: true
        };
    }

    /**
     * @notice Check competition time restrictions
     * @param {Object} tradeParams Trade parameters
     * @return {Object} Time restriction check result
     */
    _checkCompetitionTimeRestrictions(tradeParams) {
        const currentTime = Date.now();
        const timePolicy = this.activePolicies.get('competition-time-policy');
        
        // ============ Check Competition Duration ============
        const competitionStartTime = timePolicy.config.competitionStartTime;
        const competitionDuration = timePolicy.config.competitionDuration;
        const competitionEndTime = competitionStartTime + competitionDuration;

        if (currentTime > competitionEndTime) {
            return {
                success: false,
                policyId: 'competition-time-policy',
                reason: `Competition has ended. Current: ${new Date(currentTime).toISOString()}, End: ${new Date(competitionEndTime).toISOString()}`,
                violationType: 'COMPETITION_ENDED',
                competitionMode: true
            };
        }

        // ============ Check Emergency Stop ============
        if (timePolicy.config.emergencyStopEnabled && timePolicy.config.emergencyStopActive) {
            return {
                success: false,
                policyId: 'competition-time-policy',
                reason: 'Emergency stop is active',
                violationType: 'EMERGENCY_STOP_ACTIVE',
                competitionMode: true
            };
        }

        return {
            success: true,
            policyId: 'competition-time-policy',
            remainingCompetitionTime: competitionEndTime - currentTime,
            competitionMode: true
        };
    }

    /**
     * @notice Check token allowlist for competition trading pairs
     * @param {Object} tradeParams Trade parameters
     * @return {Object} Token allowlist check result
     */
    _checkTokenAllowlist(tradeParams) {
        const tokenPolicy = this.activePolicies.get('token-allowlist-policy');
        const allowedTokens = tokenPolicy.config.allowedTokens;
        const competitionPairs = tokenPolicy.config.competitionPairs;
        const strictMode = tokenPolicy.config.strictMode;

        // ============ Extract Tokens from Trading Pair ============
        const [tokenA, tokenB] = tradeParams.pair.split('/');
        
        // ============ Check if Trading Pair is in Competition List ============
        if (competitionPairs.includes(tradeParams.pair)) {
            return {
                success: true,
                policyId: 'token-allowlist-policy',
                allowedPair: true,
                competitionMode: true
            };
        }

        // ============ Check Individual Tokens if Strict Mode ============
        if (strictMode) {
            const tokenToCheck = tradeParams.action === 'BUY' ? tokenB : tokenA;
            
            if (!allowedTokens.includes(tokenToCheck)) {
                return {
                    success: false,
                    policyId: 'token-allowlist-policy',
                    reason: `Token ${tokenToCheck} not in competition allowlist`,
                    violationType: VIOLATION_TYPES.TOKEN_NOT_ALLOWED,
                    competitionMode: true
                };
            }
        }

        return {
            success: true,
            policyId: 'token-allowlist-policy',
            competitionMode: true
        };
    }

    // ============ Competition Utilities ============

    /**
     * @notice Reset spending limits if needed (hourly/daily)
     * @param {number} currentTime Current timestamp
     */
    _resetSpendingLimitsIfNeeded(currentTime) {
        // ============ Reset Hourly Spending ============
        if (currentTime >= this.spendingLimits.hourly.resetTime) {
            this.spendingLimits.hourly.spent = 0;
            this.spendingLimits.hourly.resetTime = this._getNextHourReset();
            
            logger.logVincentOperation('HOURLY_LIMIT_RESET', {
                resetTime: this.spendingLimits.hourly.resetTime,
                competitionMode: true
            });
        }

        // ============ Reset Daily Spending ============
        if (currentTime >= this.spendingLimits.daily.resetTime) {
            const previousSpent = this.spendingLimits.daily.spent;
            this.spendingLimits.daily.spent = 0;
            this.spendingLimits.daily.resetTime = this._getNextDayReset();
            
            logger.logVincentOperation('DAILY_LIMIT_RESET', {
                previousSpent,
                newLimit: this.spendingLimits.daily.limit,
                competitionMode: true
            });

            this.emit('daily_limit_reset', {
                previousSpent,
                newLimit: this.spendingLimits.daily.limit
            });
        }
    }

    /**
     * @notice Get next hour reset timestamp
     * @return {number} Next hour reset timestamp
     */
    _getNextHourReset() {
        const nextHour = new Date();
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        return nextHour.getTime();
    }

    /**
     * @notice Track competition-specific metrics
     * @param {Object} tradeParams Trade parameters
     * @param {Object} permissionResult Permission result
     */
    _trackCompetitionMetrics(tradeParams, permissionResult) {
        if (permissionResult.success) {
            // ============ Update Trade Frequency Tracking ============
            this.recentTrades.push({
                timestamp: Date.now(),
                pair: tradeParams.pair,
                action: tradeParams.action,
                amount: tradeParams.amount
            });

            // ============ Keep Only Recent Trades for Memory Efficiency ============
            const oneHourAgo = Date.now() - 3600000;
            this.recentTrades = this.recentTrades.filter(trade => trade.timestamp > oneHourAgo);

            // ============ Update Trades Per Minute ============
            this.usageStats.tradesPerMinute = this._calculateTradesPerMinute();
        }
    }

    /**
     * @notice Calculate current trades per minute
     * @return {number} Trades per minute
     */
    _calculateTradesPerMinute() {
        const oneMinuteAgo = Date.now() - 60000;
        return this.recentTrades.filter(trade => trade.timestamp > oneMinuteAgo).length;
    }

    /**
     * @notice Get last trade timestamp
     * @return {number} Last trade timestamp
     */
    _getLastTradeTime() {
        if (this.recentTrades.length === 0) return 0;
        return Math.max(...this.recentTrades.map(trade => trade.timestamp));
    }

    /**
     * @notice Count recent trades since timestamp
     * @param {number} since Timestamp to count from
     * @return {number} Number of recent trades
     */
    _countRecentTrades(since) {
        return this.recentTrades.filter(trade => trade.timestamp > since).length;
    }

    /**
     * @notice Record completed competition trade
     * @param {Object} tradeParams Trade parameters
     * @param {Object} executeResult Execution result
     */
    _recordCompetitionTrade(tradeParams, executeResult) {
        const tradeRecord = {
            id: uuidv4(),
            timestamp: Date.now(),
            pair: tradeParams.pair,
            action: tradeParams.action,
            amount: tradeParams.amount,
            result: executeResult.result,
            competitionMode: true
        };

        this.tradeHistory.push(tradeRecord);
        
        // ============ Keep Trade History Manageable ============
        if (this.tradeHistory.length > 1000) {
            this.tradeHistory = this.tradeHistory.slice(-500);
        }
    }

    /**
     * @notice Commit trade spending to all applicable policies
     * @param {Object} tradeParams Trade parameters
     */
    async _commitTradeSpending(tradeParams) {
        try {
            const amount = tradeParams.amount;
            const currentTime = Date.now();

            // ============ Update Spending Limits ============
            this.spendingLimits.daily.spent += amount;
            this.spendingLimits.hourly.spent += amount;

            // ============ Update Usage Statistics ============
            this.usageStats.totalSpent += amount;

            // ============ Log Spending Commitment ============
            logger.logVincentOperation('SPENDING_COMMITTED', {
                amount,
                pair: tradeParams.pair,
                newDailyTotal: this.spendingLimits.daily.spent,
                newHourlyTotal: this.spendingLimits.hourly.spent,
                remainingDaily: this.spendingLimits.daily.limit - this.spendingLimits.daily.spent,
                remainingHourly: this.spendingLimits.hourly.limit - this.spendingLimits.hourly.spent,
                competitionMode: true
            });

            // ============ Emit Spending Update Event ============
            this.emit('spending_updated', {
                amount,
                dailySpent: this.spendingLimits.daily.spent,
                hourlySpent: this.spendingLimits.hourly.spent,
                dailyRemaining: this.spendingLimits.daily.limit - this.spendingLimits.daily.spent,
                hourlyRemaining: this.spendingLimits.hourly.limit - this.spendingLimits.hourly.spent
            });

        } catch (error) {
            logger.error('Failed to commit trade spending', {
                error: error.message,
                tradeParams
            });
            throw error;
        }
    }

    // ============ User Consent Management ============

    /**
     * @notice Initiate user consent flow for competition
     * @param {string} redirectUri Redirect URI after consent
     * @return {string} Consent confirmation message
     */
    initiateUserConsent(redirectUri) {
        try {
            // ============ Validate Redirect URI ============
            if (!redirectUri || !redirectUri.startsWith('http')) {
                throw new Error('Invalid redirect URI provided');
            }

            // ============ Redirect User to Vincent Consent Page ============
            this.webAppClient.redirectToConsentPage({ redirectUri });

            logger.logVincentOperation('CONSENT_INITIATED', {
                appId: this.config.appId,
                redirectUri,
                competitionMode: true
            });

            return `Redirected to Vincent consent page for competition app ${this.config.appId}`;

        } catch (error) {
            logger.error('Failed to initiate user consent', {
                error: error.message,
                redirectUri
            });
            throw error;
        }
    }

    /**
     * @notice Handle user consent callback with JWT verification
     * @param {string} expectedAudience Expected JWT audience (redirect URI)
     * @return {Object} Decoded JWT and user information
     */
    handleConsentCallback(expectedAudience) {
        try {
            // ============ Check if This is a Login URI ============
            if (!this.webAppClient.isLogin()) {
                throw new Error('Not a valid consent callback URL');
            }

            // ============ Decode and Verify JWT ============
            const { decodedJWT, jwtStr } = this.webAppClient.decodeVincentLoginJWT(expectedAudience);

            // ============ Validate JWT for Competition ============
            if (jwt.isExpired(decodedJWT)) {
                throw new Error('Consent JWT has expired');
            }

            // ============ Clean Up URL ============
            this.webAppClient.removeLoginJWTFromURI();

            // ============ Extract User Information ============
            const userInfo = {
                pkpAddress: decodedJWT.payload.pkp.ethAddress,
                pkpPublicKey: decodedJWT.payload.pkp.publicKey,
                pkpTokenId: decodedJWT.payload.pkp.tokenId,
                appId: decodedJWT.payload.app.id,
                appVersion: decodedJWT.payload.app.version,
                authMethod: decodedJWT.payload.authentication
            };

            // ============ Store Current User Info ============
            this.currentUserJWT = jwtStr;
            this.currentUserInfo = userInfo;

            logger.logVincentOperation('CONSENT_COMPLETED', {
                pkpAddress: userInfo.pkpAddress,
                appId: userInfo.appId,
                authMethod: userInfo.authMethod.type,
                competitionMode: true
            });

            this.emit('user_consented', userInfo);

            return {
                success: true,
                userInfo,
                jwt: jwtStr,
                decodedJWT,
                competitionMode: true
            };

        } catch (error) {
            logger.error('Failed to handle consent callback', {
                error: error.message
            });
            throw error;
        }
    }

    // ============ Utility Methods ============

    /**
     * @notice Convert trade parameters to Vincent tool format
     * @param {Object} tradeParams Trade parameters
     * @return {Object} Vincent tool parameters
     */
    _convertToVincentToolParams(tradeParams) {
        const { pair, action, amount, price } = tradeParams;
        const [tokenA, tokenB] = pair.split('/');

        // ============ Determine Token Address Based on Action ============
        const tokenAddress = action === 'BUY' ? tokenB : tokenA;
        
        // ============ For Competition, Use Mock Token Addresses ============
        const tokenAddressMap = {
            'BTC': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
            'ETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
            'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
            'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
            'SOL': '0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4'  // SOL (wrapped)
        };

        const resolvedTokenAddress = tokenAddressMap[tokenAddress] || tokenAddress;

        return {
            tokenAddress: resolvedTokenAddress,
            amount: amount,
            recipientAddress: this.ethersSigner.address, // Delegatee address
            reason: `Competition AI Agent ${action} ${amount} ${pair} at ${new Date().toISOString()}`
        };
    }

    /**
     * @notice Get delegator address for permission check
     * @param {Object} tradeParams Trade parameters
     * @return {string} Delegator PKP address
     */
    async _getDelegatorAddress(tradeParams) {
        // ============ Use Current User Info if Available ============
        if (this.currentUserInfo && this.currentUserInfo.pkpAddress) {
            return this.currentUserInfo.pkpAddress;
        }

        // ============ Fallback to Trade Params or Delegatee ============
        return tradeParams.delegatorAddress || this.ethersSigner.address;
    }

    /**
     * @notice Calculate remaining limits after potential trade
     * @param {number} plannedAmount Amount planned to spend
     * @return {Object} Remaining limits
     */
    _calculateRemainingLimits(plannedAmount) {
        return {
            daily: this.spendingLimits.daily.limit - (this.spendingLimits.daily.spent + plannedAmount),
            hourly: this.spendingLimits.hourly.limit - (this.spendingLimits.hourly.spent + plannedAmount),
            perTrade: this.spendingLimits.perTrade.limit
        };
    }

    /**
     * @notice Get competition-specific metrics
     * @return {Object} Competition metrics
     */
    _getCompetitionMetrics() {
        const currentTime = Date.now();
        const timePolicy = this.activePolicies.get('competition-time-policy');
        const competitionStartTime = timePolicy.config.competitionStartTime;
        const competitionDuration = timePolicy.config.competitionDuration;
        const competitionEndTime = competitionStartTime + competitionDuration;

        return {
            tradesPerMinute: this._calculateTradesPerMinute(),
            totalTrades: this.recentTrades.length,
            remainingCompetitionTime: Math.max(0, competitionEndTime - currentTime),
            competitionProgress: Math.min(1, (currentTime - competitionStartTime) / competitionDuration),
            spendingUtilization: {
                daily: (this.spendingLimits.daily.spent / this.spendingLimits.daily.limit) * 100,
                hourly: (this.spendingLimits.hourly.spent / this.spendingLimits.hourly.limit) * 100
            }
        };
    }

    /**
     * @notice Generate cache key for permission results
     * @param {Object} tradeParams Trade parameters
     * @return {string} Cache key
     */
    _generateCacheKey(tradeParams) {
        const { pair, action, amount } = tradeParams;
        const timeWindow = Math.floor(Date.now() / (this.cacheTimeout / 2)); // 2.5 minute windows
        return `${pair}-${action}-${Math.floor(amount/10)*10}-${timeWindow}`;
    }

    /**
     * @notice Check if cached permission is valid for competition
     * @param {Object} cachedResult Cached permission result
     * @return {boolean} Whether cache is valid
     */
    _isCacheValidForCompetition(cachedResult) {
        const cacheAge = Date.now() - cachedResult.timestamp;
        const maxCacheAge = 30000; // 30 seconds for competition speed
        return cacheAge < maxCacheAge && cachedResult.competitionMode;
    }

    /**
     * @notice Get cached permission result
     * @param {string} cacheKey Cache key
     * @return {Object|null} Cached result or null
     */
    _getCachedPermission(cacheKey) {
        const cached = this.permissionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.result;
        }
        return null;
    }

    /**
     * @notice Cache permission result
     * @param {string} cacheKey Cache key
     * @param {Object} result Permission result
     */
    _cachePermission(cacheKey, result) {
        this.permissionCache.set(cacheKey, {
            result: {
                ...result,
                timestamp: Date.now()
            },
            timestamp: Date.now()
        });

        // ============ Clean Up Cache Periodically ============
        if (this.permissionCache.size > 100) {
            this._cleanupCache();
        }
    }

    /**
     * @notice Clean up expired cache entries
     */
    _cleanupCache() {
        const now = Date.now();
        for (const [key, entry] of this.permissionCache.entries()) {
            if (now - entry.timestamp > this.cacheTimeout) {
                this.permissionCache.delete(key);
            }
        }
    }

    /**
     * @notice Get applicable policies for trade
     * @param {Object} tradeParams Trade parameters
     * @return {Array} Array of applicable policies
     */
    _getApplicablePolicies(tradeParams) {
        return Array.from(this.activePolicies.values())
            .filter(policy => policy.isActive)
            .map(policy => ({
                id: policy.id,
                type: policy.type,
                name: policy.name,
                competitionMode: policy.config.competitionMode || false
            }));
    }

    /**
     * @notice Get next day reset timestamp
     * @return {number} Next reset timestamp
     */
    _getNextDayReset() {
        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);
        return tomorrow.getTime();
    }

    /**
     * @notice Validate trade parameters for competition
     * @param {Object} tradeParams Trade parameters
     */
    _validateTradeParams(tradeParams) {
        const required = ['pair', 'action', 'amount'];
        const missing = required.filter(field => !tradeParams[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required trade parameters: ${missing.join(', ')}`);
        }

        if (typeof tradeParams.amount !== 'number' || tradeParams.amount <= 0) {
            throw new Error('Trade amount must be a positive number');
        }

        if (!['BUY', 'SELL'].includes(tradeParams.action.toUpperCase())) {
            throw new Error('Trade action must be BUY or SELL');
        }

        // ============ Competition-Specific Validations ============
        if (tradeParams.amount > this.spendingLimits.perTrade.limit) {
            throw new Error(`Trade amount ${tradeParams.amount} exceeds per-trade limit ${this.spendingLimits.perTrade.limit}`);
        }

        const competitionPairs = this.tradingConfig.tradingPairs || ['BTC/USDT', 'ETH/USDT', 'SOL/USDC'];
        if (!competitionPairs.includes(tradeParams.pair)) {
            logger.warn('Trading pair not in competition list', {
                pair: tradeParams.pair,
                allowedPairs: competitionPairs
            });
        }
    }

    /**
     * @notice Update usage statistics
     * @param {boolean} success Whether request was successful
     * @param {number} processingTime Processing time in milliseconds
     */
    _updateUsageStats(success, processingTime) {
        this.usageStats.totalRequests++;
        
        if (success) {
            this.usageStats.approvedRequests++;
        } else {
            this.usageStats.deniedRequests++;
        }

        // ============ Update Average Processing Time ============
        const totalTime = this.usageStats.avgProcessingTime * (this.usageStats.totalRequests - 1) + processingTime;
        this.usageStats.avgProcessingTime = totalTime / this.usageStats.totalRequests;
    }

    /**
     * @notice Record policy violation for monitoring
     * @param {Object} violation Violation details
     */
    _recordPolicyViolation(violation) {
        const violationRecord = {
            ...violation,
            timestamp: Date.now(),
            competitionMode: true
        };

        this.policyViolations.push(violationRecord);

        // ============ Keep Only Recent Violations ============
        if (this.policyViolations.length > MAX_VIOLATIONS_HISTORY) {
            this.policyViolations = this.policyViolations.slice(-MAX_VIOLATIONS_HISTORY / 2);
        }

        this.emit('policy_violation', violationRecord);
    }

    /**
     * @notice Start policy monitoring for competition
     * @dev Periodically checks and updates policy states with competition optimizations
     */
    _startPolicyMonitoring() {
        // ============ High-Frequency Monitoring for Competition ============
        const monitoringInterval = setInterval(() => {
            const now = Date.now();
            
            // ============ Reset Spending Limits if Needed ============
            this._resetSpendingLimitsIfNeeded(now);
            
            // ============ Clean Up Old Trade Records ============
            this._cleanupOldTrades(now);
            
            // ============ Update Competition Metrics ============
            this.usageStats.tradesPerMinute = this._calculateTradesPerMinute();
            
        }, MONITORING_INTERVAL / 2); // Monitor every 30 seconds for competition

        // ============ Cache Cleanup ============
        const cacheCleanupInterval = setInterval(() => {
            this._cleanupCache();
        }, this.cacheTimeout);

        // ============ Store Intervals for Cleanup ============
        this.monitoringIntervals = [monitoringInterval, cacheCleanupInterval];
    }

    /**
     * @notice Clean up old trade records to manage memory
     * @param {number} currentTime Current timestamp
     */
    _cleanupOldTrades(currentTime) {
        const oneHourAgo = currentTime - 3600000;
        
        // ============ Keep Only Trades from Last Hour ============
        this.recentTrades = this.recentTrades.filter(trade => trade.timestamp > oneHourAgo);
        
        // ============ Keep Trade History Manageable ============
        if (this.tradeHistory.length > 1000) {
            this.tradeHistory = this.tradeHistory.slice(-500);
        }
    }

    /**
     * @notice Extract policy commitments from execution result
     * @param {Object} executeResult Execution result
     * @return {Array} Policy commitments
     */
    _extractPolicyCommitments(executeResult) {
        // ============ Extract Policy Commitment Results ============
        if (!executeResult.context || !executeResult.context.policiesContext) {
            return [];
        }

        const commitments = [];
        const policiesContext = executeResult.context.policiesContext;

        // ============ Process Each Policy Commitment ============
        for (const [policyName, policyResult] of Object.entries(policiesContext.allowedPolicies || {})) {
            if (policyResult.commit) {
                commitments.push({
                    policyName,
                    committed: true,
                    result: policyResult.result,
                    timestamp: Date.now()
                });
            }
        }

        return commitments;
    }

    /**
     * @notice Identify violated policies from precheck result
     * @param {Object} precheckResult Precheck result
     * @return {Array} Violated policies
     */
    _identifyViolatedPolicies(precheckResult) {
        const violations = [];

        // ============ Extract Violation Information ============
        if (precheckResult.context && precheckResult.context.policiesContext) {
            const deniedPolicy = precheckResult.context.policiesContext.deniedPolicy;
            
            if (deniedPolicy) {
                violations.push({
                    policyName: deniedPolicy.policyPackageName,
                    reason: deniedPolicy.result.reason || 'Policy violation',
                    violationType: deniedPolicy.result.violationType || 'UNKNOWN'
                });
            }
        }

        return violations;
    }

    /**
     * @notice Get updated spending limits after trade
     * @return {Object} Updated spending limits
     */
    _getUpdatedSpendingLimits() {
        return {
            daily: {
                limit: this.spendingLimits.daily.limit,
                spent: this.spendingLimits.daily.spent,
                remaining: this.spendingLimits.daily.limit - this.spendingLimits.daily.spent,
                resetTime: this.spendingLimits.daily.resetTime
            },
            hourly: {
                limit: this.spendingLimits.hourly.limit,
                spent: this.spendingLimits.hourly.spent,
                remaining: this.spendingLimits.hourly.limit - this.spendingLimits.hourly.spent,
                resetTime: this.spendingLimits.hourly.resetTime
            },
            perTrade: {
                limit: this.spendingLimits.perTrade.limit
            }
        };
    }

    // ============ Public API Methods ============

    /**
     * @notice Get current spending status for competition monitoring
     * @return {Object} Current spending information with competition metrics
     */
    getSpendingStatus() {
        return {
            daily: {
                limit: this.spendingLimits.daily.limit,
                spent: this.spendingLimits.daily.spent,
                remaining: this.spendingLimits.daily.limit - this.spendingLimits.daily.spent,
                utilization: (this.spendingLimits.daily.spent / this.spendingLimits.daily.limit) * 100,
                resetTime: this.spendingLimits.daily.resetTime
            },
            hourly: {
                limit: this.spendingLimits.hourly.limit,
                spent: this.spendingLimits.hourly.spent,
                remaining: this.spendingLimits.hourly.limit - this.spendingLimits.hourly.spent,
                utilization: (this.spendingLimits.hourly.spent / this.spendingLimits.hourly.limit) * 100,
                resetTime: this.spendingLimits.hourly.resetTime
            },
            perTrade: {
                limit: this.spendingLimits.perTrade.limit
            },
            competitionMode: true
        };
    }

    /**
     * @notice Get active policies with competition information
     * @return {Array} Array of active policies
     */
    getActivePolicies() {
        return Array.from(this.activePolicies.values()).map(policy => ({
            ...policy,
            competitionOptimized: policy.config.competitionMode || false
        }));
    }

    /**
     * @notice Get comprehensive usage statistics for competition
     * @return {Object} Usage statistics with competition metrics
     */
    getUsageStats() {
        return {
            ...this.usageStats,
            approvalRate: this.usageStats.totalRequests > 0 
                ? (this.usageStats.approvedRequests / this.usageStats.totalRequests) * 100 
                : 0,
            tradesPerMinute: this._calculateTradesPerMinute(),
            recentTradesCount: this.recentTrades.length,
            competitionMetrics: this._getCompetitionMetrics()
        };
    }

    /**
     * @notice Get recent policy violations with filtering
     * @param {number} limit Maximum number of violations to return
     * @param {string} type Optional violation type filter
     * @return {Array} Array of recent violations
     */
    getRecentViolations(limit = 10, type = null) {
        let violations = this.policyViolations.slice(-limit);
        
        if (type) {
            violations = violations.filter(v => v.violationType === type);
        }
        
        return violations;
    }

    /**
     * @notice Get comprehensive client status for competition dashboard
     * @return {Object} Client status information
     */
    getStatus() {
        const competitionMetrics = this._getCompetitionMetrics();
        
        return {
            isInitialized: this.isInitialized,
            competitionMode: true,
            activePolicies: this.activePolicies.size,
            delegateeAddress: this.ethersSigner?.address,
            currentUser: this.currentUserInfo?.pkpAddress || null,
            
            // ============ Performance Metrics ============
            performance: {
                totalRequests: this.usageStats.totalRequests,
                approvalRate: this.usageStats.totalRequests > 0 
                    ? (this.usageStats.approvedRequests / this.usageStats.totalRequests) * 100 
                    : 0,
                avgProcessingTime: this.usageStats.avgProcessingTime,
                tradesPerMinute: competitionMetrics.tradesPerMinute
            },
            
            // ============ Spending Utilization ============
            spendingUtilization: {
                daily: (this.spendingLimits.daily.spent / this.spendingLimits.daily.limit) * 100,
                hourly: (this.spendingLimits.hourly.spent / this.spendingLimits.hourly.limit) * 100
            },
            
            // ============ Competition Status ============
            competition: competitionMetrics,
            
            // ============ Health Indicators ============
            health: {
                recentViolations: this.policyViolations.slice(-5).length,
                cacheSize: this.permissionCache.size,
                tradeHistorySize: this.tradeHistory.length
            }
        };
    }

    /**
     * @notice Get competition performance summary
     * @return {Object} Competition performance data
     */
    getCompetitionSummary() {
        const metrics = this._getCompetitionMetrics();
        const spendingStatus = this.getSpendingStatus();
        
        return {
            totalTrades: this.recentTrades.length,
            tradesPerMinute: metrics.tradesPerMinute,
            totalSpent: this.usageStats.totalSpent,
            spendingEfficiency: {
                dailyUtilization: spendingStatus.daily.utilization,
                hourlyUtilization: spendingStatus.hourly.utilization
            },
            remainingTime: metrics.remainingCompetitionTime,
            competitionProgress: metrics.competitionProgress,
            approvalRate: this.usageStats.totalRequests > 0 
                ? (this.usageStats.approvedRequests / this.usageStats.totalRequests) * 100 
                : 0,
            avgProcessingTime: this.usageStats.avgProcessingTime,
            recentViolations: this.policyViolations.slice(-10).length
        };
    }

    /**
     * @notice Emergency stop for competition
     * @param {string} reason Reason for emergency stop
     */
    emergencyStop(reason = 'Manual emergency stop') {
        try {
            // ============ Activate Emergency Stop ============
            const timePolicy = this.activePolicies.get('competition-time-policy');
            if (timePolicy) {
                timePolicy.config.emergencyStopActive = true;
                timePolicy.config.emergencyStopReason = reason;
                timePolicy.config.emergencyStopTime = Date.now();
            }

            logger.logVincentOperation('EMERGENCY_STOP_ACTIVATED', {
                reason,
                timestamp: Date.now(),
                activePolicies: this.activePolicies.size,
                competitionMode: true
            });

            this.emit('emergency_stop', { reason, timestamp: Date.now() });

        } catch (error) {
            logger.error('Failed to activate emergency stop', {
                error: error.message,
                reason
            });
            throw error;
        }
    }

    /**
     * @notice Resume from emergency stop
     * @param {string} reason Reason for resuming
     */
    resumeFromEmergencyStop(reason = 'Manual resume') {
        try {
            // ============ Deactivate Emergency Stop ============
            const timePolicy = this.activePolicies.get('competition-time-policy');
            if (timePolicy) {
                timePolicy.config.emergencyStopActive = false;
                timePolicy.config.resumeReason = reason;
                timePolicy.config.resumeTime = Date.now();
            }

            logger.logVincentOperation('EMERGENCY_STOP_DEACTIVATED', {
                reason,
                timestamp: Date.now(),
                competitionMode: true
            });

            this.emit('emergency_resume', { reason, timestamp: Date.now() });

        } catch (error) {
            logger.error('Failed to resume from emergency stop', {
                error: error.message,
                reason
            });
            throw error;
        }
    }

    /**
     * @notice Update spending limits during competition
     * @param {Object} newLimits New spending limits
     */
    updateSpendingLimits(newLimits) {
        try {
            const oldLimits = { ...this.spendingLimits };

            // ============ Update Limits Safely ============
            if (newLimits.daily && newLimits.daily > 0) {
                this.spendingLimits.daily.limit = newLimits.daily;
            }
            
            if (newLimits.hourly && newLimits.hourly > 0) {
                this.spendingLimits.hourly.limit = newLimits.hourly;
            }
            
            if (newLimits.perTrade && newLimits.perTrade > 0) {
                this.spendingLimits.perTrade.limit = newLimits.perTrade;
            }

            // ============ Update Policy Configurations ============
            const spendingPolicy = this.activePolicies.get('competition-spending-policy');
            if (spendingPolicy) {
                spendingPolicy.config.dailyLimit = this.spendingLimits.daily.limit;
                spendingPolicy.config.hourlyLimit = this.spendingLimits.hourly.limit;
                spendingPolicy.config.perTradeLimit = this.spendingLimits.perTrade.limit;
            }

            logger.logVincentOperation('SPENDING_LIMITS_UPDATED', {
                oldLimits: {
                    daily: oldLimits.daily.limit,
                    hourly: oldLimits.hourly.limit,
                    perTrade: oldLimits.perTrade.limit
                },
                newLimits: {
                    daily: this.spendingLimits.daily.limit,
                    hourly: this.spendingLimits.hourly.limit,
                    perTrade: this.spendingLimits.perTrade.limit
                },
                competitionMode: true
            });

            this.emit('spending_limits_updated', {
                oldLimits,
                newLimits: this.spendingLimits
            });

        } catch (error) {
            logger.error('Failed to update spending limits', {
                error: error.message,
                newLimits
            });
            throw error;
        }
    }

    /**
     * @notice Disconnect from Vincent with cleanup
     */
    async disconnect() {
        try {
            // ============ Clear Monitoring Intervals ============
            if (this.monitoringIntervals) {
                this.monitoringIntervals.forEach(interval => clearInterval(interval));
                this.monitoringIntervals = null;
            }

            // ============ Clear Caches and State ============
            this.permissionCache.clear();
            this.recentTrades.length = 0;
            this.policyViolations.length = 0;

            // ============ Reset State ============
            this.isInitialized = false;
            this.currentUserJWT = null;
            this.currentUserInfo = null;

            this.emit('disconnected');

            logger.logVincentOperation('DISCONNECT', { 
                success: true,
                competitionMode: true
            });

        } catch (error) {
            logger.error('Failed to disconnect from Vincent', {
                error: error.message
            });
            throw error;
        }
    }

    // ============ Development and Testing Utilities ============

    /**
     * @notice Reset spending limits for testing
     * @dev Only use in development/testing environments
     */
    resetSpendingLimits() {
        if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
            throw new Error('Reset spending limits only allowed in development/test environments');
        }

        this.spendingLimits.daily.spent = 0;
        this.spendingLimits.hourly.spent = 0;
        this.usageStats.totalSpent = 0;

        logger.logVincentOperation('SPENDING_LIMITS_RESET', {
            environment: process.env.NODE_ENV,
            competitionMode: true
        });
    }

    /**
     * @notice Simulate policy violation for testing
     * @param {string} violationType Type of violation to simulate
     * @dev Only use in development/testing environments
     */
    simulatePolicyViolation(violationType) {
        if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
            throw new Error('Simulate policy violation only allowed in development/test environments');
        }

        const mockViolation = {
            success: false,
            requestId: uuidv4(),
            reason: `Simulated ${violationType} violation`,
            violationType,
            policyId: 'test-policy',
            timestamp: Date.now(),
            simulated: true
        };

        this._recordPolicyViolation(mockViolation);

        logger.logVincentOperation('POLICY_VIOLATION_SIMULATED', {
            violationType,
            environment: process.env.NODE_ENV
        });

        return mockViolation;
    }
}

export default VincentClient;