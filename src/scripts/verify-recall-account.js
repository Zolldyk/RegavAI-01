// ============ Recall Account Verification Script ============
// File: scripts/verify-recall-account.js

import axios from 'axios';
import dotenv from 'dotenv';

// ============ Load Environment Variables ============
dotenv.config();

/**
 * @notice Verify Recall account by placing a test trade
 * @dev This script places the required verification trade to activate your account
 */
class RecallAccountVerifier {
  constructor () {
    this.apiKey = process.env.TRADING_SIM_API_KEY;
    this.apiUrl = process.env.TRADING_SIM_API_URL;

    if (!this.apiKey || !this.apiUrl) {
      throw new Error('Missing required environment variables: TRADING_SIM_API_KEY, TRADING_SIM_API_URL');
    }

    // ============ Initialize HTTP Client ============
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      timeout: 30000 // 30 second timeout
    });
  }

  /**
     * @notice Execute verification trade to activate account
     * @dev Places a small USDC to WETH trade as required by Recall
     */
  async verifyAccount () {
    try {
      console.log('🔄 Starting Recall account verification...');

      // ============ Check Current Portfolio ============
      console.log('📊 Checking current portfolio...');
      const portfolio = await this.getPortfolio();
      console.log('Portfolio:', JSON.stringify(portfolio, null, 2));

      // ============ Execute Verification Trade ============
      const verificationTrade = {
        fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        toToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        amount: '100', // Trade 100 USDC
        reason: 'Trading 100 USDC to WETH on Ethereum Mainnet to verify my Recall developer account'
      };

      console.log('🔄 Executing verification trade...');
      const tradeResult = await this.executeTrade(verificationTrade);

      if (tradeResult.success) {
        console.log('✅ Verification trade successful!');
        console.log('Trade Details:', JSON.stringify(tradeResult.transaction, null, 2));

        // ============ Verify Account Status ============
        await this.checkVerificationStatus();

        return true;
      } else {
        console.error('❌ Verification trade failed:', tradeResult.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Account verification failed:', error.message);

      if (error.response) {
        console.error('API Response:', error.response.data);
      }

      return false;
    }
  }

  /**
     * @notice Get current portfolio information
     * @return {Object} Portfolio data including balances and total value
     */
  async getPortfolio () {
    try {
      const response = await this.client.get('/api/agent/portfolio');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch portfolio:', error.message);
      throw error;
    }
  }

  /**
     * @notice Execute a trade in the sandbox
     * @param {Object} trade Trade parameters
     * @return {Object} Trade execution result
     */
  async executeTrade (trade) {
    try {
      const response = await this.client.post('/api/trade/execute', trade);
      return response.data;
    } catch (error) {
      console.error('Trade execution failed:', error.message);
      throw error;
    }
  }

  /**
     * @notice Check verification status of the account
     */
  async checkVerificationStatus () {
    try {
      console.log('🔍 Checking account verification status...');

      // ============ Get Agent Profile ============
      const profileResponse = await this.client.get('/api/agent/profile');

      if (profileResponse.data.success) {
        const { agent } = profileResponse.data;

        console.log('📋 Agent Profile:');
        console.log(`  - Agent ID: ${agent.id}`);
        console.log(`  - Wallet Address: ${agent.walletAddress}`);
        console.log(`  - Verification Status: ${agent.isVerified ? '✅ Verified' : '❌ Not Verified'}`);
        console.log(`  - Status: ${agent.status}`);

        if (agent.isVerified) {
          console.log('🎉 Your account is now verified and ready for competitions!');
          console.log('💡 Save your API key securely - you\'ll need it for competitions');
        } else {
          console.log('⏳ Verification may take a few minutes to process...');
        }

        return agent.isVerified;
      }
    } catch (error) {
      console.error('Failed to check verification status:', error.message);
    }
  }

  /**
     * @notice Test API connectivity
     */
  async testConnection () {
    try {
      console.log('🔄 Testing API connection...');
      const response = await this.client.get('/api/health');

      if (response.data) {
        console.log('✅ API connection successful');
        return true;
      }
    } catch (error) {
      console.error('❌ API connection failed:', error.message);
      return false;
    }
  }
}

/**
 * @notice Main execution function
 */
async function main () {
  try {
    const verifier = new RecallAccountVerifier();

    // ============ Test Connection First ============
    const connectionOk = await verifier.testConnection();
    if (!connectionOk) {
      console.error('❌ Cannot connect to Recall API. Please check your configuration.');
      process.exit(1);
    }

    // ============ Execute Verification ============
    const verified = await verifier.verifyAccount();

    if (verified) {
      console.log('\n🎉 Account verification completed successfully!');
      console.log('📝 Next steps:');
      console.log('   1. Check your email for competition acceptance notifications');
      console.log('   2. Complete your agent profile if needed');
      console.log('   3. Prepare your trading agent for competitions');
      console.log('   4. Monitor the competitions hub for upcoming events');
    } else {
      console.log('\n❌ Account verification failed. Please try again or contact support.');
    }
  } catch (error) {
    console.error('Script execution failed:', error.message);
    process.exit(1);
  }
}

// ============ Execute if Called Directly ============
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { RecallAccountVerifier };
