// ============================================================================
// Trade Amount Limit Policy - Vincent Policy Implementation
// ============================================================================

import { createVincentPolicy } from '@lit-protocol/vincent-tool-sdk';
import { z } from 'zod';

// ============ Parameter Schemas ============
const toolParamsSchema = z.object({
  tokenAddress: z.string(),
  amountToSend: z.number().positive(),
  chainId: z.number().optional().default(1)
});

const userParamsSchema = z.object({
  maxTradeAmount: z.number().positive().default(1000), // $1,000 default
  allowedChains: z.array(z.number()).default([1, 10, 42161, 8453, 137]), // Ethereum, Optimism, Arbitrum, Base, Polygon
  currency: z.string().default('USD'), // Currency for limit
  tokenPriceOracle: z.string().optional() // Optional price oracle address
});

// ============ Result Schemas ============
const precheckAllowResultSchema = z.object({
  maxTradeAmount: z.number(),
  requestedAmount: z.number(),
  requestedAmountUSD: z.number(),
  withinLimit: z.boolean(),
  chainSupported: z.boolean(),
  allowedChains: z.array(z.number())
});

const precheckDenyResultSchema = z.object({
  reason: z.string(),
  maxTradeAmount: z.number(),
  requestedAmount: z.number(),
  requestedAmountUSD: z.number(),
  exceededBy: z.number(),
  chainSupported: z.boolean(),
  allowedChains: z.array(z.number())
});

const evalAllowResultSchema = z.object({
  maxTradeAmount: z.number(),
  requestedAmountUSD: z.number(),
  approved: z.boolean(),
  chainId: z.number(),
  timestamp: z.number()
});

const evalDenyResultSchema = z.object({
  reason: z.string(),
  maxTradeAmount: z.number(),
  requestedAmountUSD: z.number(),
  exceededBy: z.number(),
  chainId: z.number(),
  timestamp: z.number()
});

// ============ Helper Functions ============

/**
 * Get token price in USD from multiple sources
 */
async function getTokenPriceUSD (tokenAddress, _chainId) {
  try {
    // Simple price mapping for major tokens (in production, use proper oracle)
    const tokenPrices = {
      // Ethereum Mainnet
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 2000, // WETH
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 1, // USDC
      '0xdAC17F958D2ee523a2206206994597C13D831ec7': 1, // USDT
      '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': 45000, // WBTC
      '0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4': 100 // SOL (wrapped)
    };

    // Normalize address
    const normalizedAddress = tokenAddress.toLowerCase();

    // Return price or default to 1 USD for unknown tokens
    return tokenPrices[normalizedAddress] || 1;
  } catch (error) {
    console.warn(`Failed to get token price for ${tokenAddress}:`, error.message);
    return 1; // Default to 1 USD if price fetch fails
  }
}

/**
 * Convert token amount to USD value
 */
async function convertToUSD (tokenAddress, amount, chainId) {
  const tokenPrice = await getTokenPriceUSD(tokenAddress, chainId);
  return amount * tokenPrice;
}

/**
 * Check if chain is supported
 */
function isChainSupported (chainId, allowedChains) {
  return allowedChains.includes(chainId);
}

// ============ Create Vincent Policy ============
export const vincentPolicy = createVincentPolicy({
  packageName: '@regav-ai/vincent-policy-trade-amount-limit',

  toolParamsSchema,
  userParamsSchema,

  // ============ Precheck Function ============
  precheckAllowResultSchema,
  precheckDenyResultSchema,
  precheck: async ({ toolParams, userParams }, policyContext) => {
    const { tokenAddress, amountToSend, chainId } = toolParams;
    const { maxTradeAmount, allowedChains } = userParams;

    try {
      // ============ Check Chain Support ============
      const chainSupported = isChainSupported(chainId, allowedChains);

      if (!chainSupported) {
        return policyContext.deny({
          reason: `Chain ${chainId} not supported. Allowed chains: ${allowedChains.join(', ')}`,
          maxTradeAmount,
          requestedAmount: amountToSend,
          requestedAmountUSD: 0,
          exceededBy: 0,
          chainSupported: false,
          allowedChains
        });
      }

      // ============ Convert Amount to USD ============
      const requestedAmountUSD = await convertToUSD(tokenAddress, amountToSend, chainId);

      // ============ Check Trade Amount Limit ============
      const withinLimit = requestedAmountUSD <= maxTradeAmount;

      if (!withinLimit) {
        const exceededBy = requestedAmountUSD - maxTradeAmount;

        return policyContext.deny({
          reason: `Trade amount $${requestedAmountUSD.toFixed(2)} exceeds limit of $${maxTradeAmount}`,
          maxTradeAmount,
          requestedAmount: amountToSend,
          requestedAmountUSD,
          exceededBy,
          chainSupported: true,
          allowedChains
        });
      }

      // ============ Allow Trade ============
      return policyContext.allow({
        maxTradeAmount,
        requestedAmount: amountToSend,
        requestedAmountUSD,
        withinLimit: true,
        chainSupported: true,
        allowedChains
      });
    } catch (error) {
      return policyContext.deny({
        reason: `Policy precheck error: ${error.message}`,
        maxTradeAmount,
        requestedAmount: amountToSend,
        requestedAmountUSD: 0,
        exceededBy: 0,
        chainSupported: false,
        allowedChains
      });
    }
  },

  // ============ Evaluate Function ============
  evalAllowResultSchema,
  evalDenyResultSchema,
  evaluate: async ({ toolParams, userParams }, policyContext) => {
    const { tokenAddress, amountToSend, chainId } = toolParams;
    const { maxTradeAmount, allowedChains } = userParams;
    const timestamp = Date.now();

    try {
      // ============ Check Chain Support ============
      const chainSupported = isChainSupported(chainId, allowedChains);

      if (!chainSupported) {
        return policyContext.deny({
          reason: `Chain ${chainId} not supported for trading`,
          maxTradeAmount,
          requestedAmountUSD: 0,
          exceededBy: 0,
          chainId,
          timestamp
        });
      }

      // ============ Convert Amount to USD ============
      const requestedAmountUSD = await convertToUSD(tokenAddress, amountToSend, chainId);

      // ============ Check Trade Amount Limit ============
      if (requestedAmountUSD > maxTradeAmount) {
        const exceededBy = requestedAmountUSD - maxTradeAmount;

        return policyContext.deny({
          reason: `Trade amount $${requestedAmountUSD.toFixed(2)} exceeds maximum allowed $${maxTradeAmount}`,
          maxTradeAmount,
          requestedAmountUSD,
          exceededBy,
          chainId,
          timestamp
        });
      }

      // ============ Allow Trade ============
      return policyContext.allow({
        maxTradeAmount,
        requestedAmountUSD,
        approved: true,
        chainId,
        timestamp
      });
    } catch (error) {
      return policyContext.deny({
        reason: `Policy evaluation error: ${error.message}`,
        maxTradeAmount,
        requestedAmountUSD: 0,
        exceededBy: 0,
        chainId,
        timestamp
      });
    }
  }

  // Note: No commit function needed for this policy as it doesn't track state
});

export default vincentPolicy;
