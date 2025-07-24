#!/usr/bin/env node

// ============================================================================
// Recall Trading Agent - Startup Script
// ============================================================================

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import RecallClient from './src/integrations/RecallClient.js';
import VincentClient from './src/integrations/VincentClient.js';
import GaiaClient from './src/integrations/Gaia.Client.js';
import { ScalpingAgent } from './src/agent/ScalpingAgent.js';
import Logger from './src/utils/Logger.js';

// ============ Module Setup ============
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// ============ Global Configuration ============
const COMPETITION_MODE = process.env.NODE_ENV === 'production';
const NETWORK = process.env.RECALL_NETWORK || 'testnet';
const AGENT_NAME = process.env.AGENT_NAME || 'Regav';

/**
 * @title RecallTradingAgent
 * @notice Main trading agent for Recall competitions
 */
class RecallTradingAgent {
  constructor() {
    this.isRunning = false;
    this.recallClient = null;
    this.vincentClient = null;
    this.gaiaClient = null;
    this.scalpingAgent = null;
    this.logger = Logger;
    
    // Graceful shutdown handling
    process.once('SIGTERM', () => this.shutdown('SIGTERM'));
    process.once('SIGINT', () => this.shutdown('SIGINT'));
    process.once('uncaughtException', (error) => this.handleError('uncaughtException', error));
    process.once('unhandledRejection', (reason) => this.handleError('unhandledRejection', reason));
  }

  /**
   * @notice Initialize all trading agent components
   */
  async initialize() {
    try {
      this.logger.info('🚀 Initializing Recall Trading Agent...', {
        network: NETWORK,
        agent: AGENT_NAME,
        competition: COMPETITION_MODE
      });

      // ============ Initialize Integrations ============
      this.logger.info('🔧 Initializing integrations...');
      
      // Initialize Recall Client
      this.recallClient = new RecallClient();
      await this.recallClient.initialize();
      this.logger.info('✅ Recall client initialized');

      // Initialize Vincent Client (if configured)
      if (process.env.VINCENT_APP_ID) {
        this.vincentClient = new VincentClient();
        await this.vincentClient.initialize();
        this.logger.info('✅ Vincent client initialized');
      }

      // Initialize Gaia Client (if configured)
      if (process.env.GAIA_API_KEY) {
        this.gaiaClient = new GaiaClient();
        await this.gaiaClient.initialize();
        this.logger.info('✅ Gaia client initialized');
      }

      // ============ Initialize Trading Agent ============
      this.scalpingAgent = new ScalpingAgent({
        recallClient: this.recallClient,
        vincentClient: this.vincentClient,
        gaiaClient: this.gaiaClient
      });

      await this.scalpingAgent.initialize();
      this.logger.info('✅ Scalping agent initialized');

      // ============ Verify Account Status ============
      const portfolio = await this.recallClient.getPortfolio();
      
      // Debug: Log the actual response structure
      this.logger.info('🔍 Portfolio Response Structure:', {
        keys: Object.keys(portfolio || {}),
        fullResponse: portfolio
      });
      
      this.logger.info('💰 Portfolio Status:', {
        totalValue: portfolio?.totalValue || portfolio?.totalBalanceUsd || 0,
        tokenCount: portfolio?.tokens?.length || portfolio?.balances?.length || 0,
        balances: portfolio?.balances || portfolio?.tokens || 'No balances data'
      });

      this.logger.info('🎉 Recall Trading Agent initialized successfully!');
      return true;

    } catch (error) {
      this.logger.error('❌ Failed to initialize trading agent:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * @notice Start the trading agent
   */
  async start() {
    try {
      if (this.isRunning) {
        this.logger.warn('Agent is already running');
        return;
      }

      this.logger.info('🏁 Starting Recall Trading Agent...');
      
      // Start the scalping agent
      await this.scalpingAgent.start();
      this.isRunning = true;

      this.logger.info('⚡ Trading agent is now active!');
      
      // Competition mode vs sandbox mode
      if (COMPETITION_MODE) {
        this.logger.info('🏆 Running in COMPETITION mode');
        this.logger.info('🎯 Target: High-frequency scalping for maximum profit');
      } else {
        this.logger.info('🧪 Running in SANDBOX mode');
        this.logger.info('📊 Testing and development mode active');
      }

      // Keep the process alive
      this.keepAlive();

    } catch (error) {
      this.logger.error('❌ Failed to start trading agent:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * @notice Keep the agent running and monitor health
   */
  keepAlive() {
    // Health check interval
    setInterval(async () => {
      try {
        if (this.scalpingAgent && this.isRunning) {
          const status = await this.scalpingAgent.getStatus();
          this.logger.debug('🔋 Agent health check:', {
            trades: status.tradesExecuted,
            pnl: status.totalPnL,
            uptime: status.uptime
          });
        }
      } catch (error) {
        this.logger.error('❌ Health check failed:', error.message);
      }
    }, 60000); // Every minute

    this.logger.info('❤️ Agent monitoring active');
  }

  /**
   * @notice Gracefully shutdown the agent
   */
  async shutdown(signal) {
    this.logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
      this.isRunning = false;
      
      if (this.scalpingAgent) {
        await this.scalpingAgent.stop();
        this.logger.info('✅ Scalping agent stopped');
      }

      // ============ Disconnect All Clients ============
      if (this.vincentClient) {
        this.logger.info('Disconnecting Vincent client...');
        await this.vincentClient.disconnect();
      }

      if (this.gaiaClient) {
        this.logger.info('Disconnecting Gaia client...');
        await this.gaiaClient.disconnect();
      }

      // Final status report
      if (this.recallClient) {
        try {
          const portfolio = await this.recallClient.getPortfolio();
          this.logger.info('📊 Final Portfolio Status:', {
            totalValue: portfolio.totalValue,
            pnl: portfolio.pnl || 0,
            tokenCount: portfolio.tokens ? portfolio.tokens.length : 0
          });
        } catch (error) {
          this.logger.warn('Could not retrieve final portfolio status:', error.message);
        }

        // Disconnect Recall client last
        this.logger.info('Disconnecting Recall client...');
        await this.recallClient.disconnect();
      }

      // Display uptime
      const startTime = Date.now();
      const uptime = Math.round((Date.now() - startTime) / 1000);
      this.logger.info(`⏱️ Agent uptime: ${uptime}s`);

      this.logger.info('👋 Recall Trading Agent shutdown complete');
      process.exit(0);

    } catch (error) {
      this.logger.error('❌ Error during shutdown:', error.message);
      process.exit(1);
    }
  }

  /**
   * @notice Handle unexpected errors
   */
  handleError(type, error) {
    this.logger.error(`💥 ${type}:`, {
      error: error.message || error,
      stack: error.stack
    });

    // Attempt graceful shutdown
    if (this.isRunning) {
      this.shutdown(type);
    } else {
      process.exit(1);
    }
  }
}

/**
 * @notice Main execution function
 */
async function main() {
  console.log('🤖 Recall Trading Agent v1.0.0');
  console.log('🏆 Built for Recall Network Competition');
  console.log('=====================================');

  try {
    const agent = new RecallTradingAgent();
    await agent.initialize();
    await agent.start();
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Start the agent
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default RecallTradingAgent;