// ============================================================================
// Token Allowlist Policy - Vincent Policy Implementation
// ============================================================================

import { createVincentPolicy } from '@lit-protocol/vincent-tool-sdk';
import { z } from 'zod';

// ============ Parameter Schemas ============
const toolParamsSchema = z.object({
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
  amountToSend: z.number().positive(),
  chainId: z.number().optional().default(1),
  recipientAddress: z.string().optional()
});

const userParamsSchema = z.object({
  allowedTokens: z.array(z.string()).default([
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4' // SOL (wrapped)
  ]),
  allowedChains: z.array(z.number()).default([1, 10, 42161, 8453, 137]), // Multi-chain support
  strictMode: z.boolean().default(true), // Strict enforcement
  allowUnknownTokens: z.boolean().default(false), // Allow unknown tokens
  tokenCategories: z.object({
    stablecoins: z.array(z.string()).optional(),
    majorTokens: z.array(z.string()).optional(),
    defiTokens: z.array(z.string()).optional()
  }).optional(),
  maxTokensPerTransaction: z.number().default(1), // Single token per transaction
  requireTokenVerification: z.boolean().default(true) // Require token contract verification
});

// ============ Result Schemas ============
const precheckAllowResultSchema = z.object({
  tokenAddress: z.string(),
  isAllowed: z.boolean(),
  tokenCategory: z.string().optional(),
  chainSupported: z.boolean(),
  allowedTokens: z.array(z.string()),
  tokenVerified: z.boolean().optional(),
  tokenSymbol: z.string().optional(),
  tokenName: z.string().optional()
});

const precheckDenyResultSchema = z.object({
  reason: z.string(),
  tokenAddress: z.string(),
  isAllowed: z.boolean(),
  chainSupported: z.boolean(),
  allowedTokens: z.array(z.string()),
  suggestedAlternatives: z.array(z.string()).optional(),
  tokenVerified: z.boolean().optional()
});

const evalAllowResultSchema = z.object({
  approved: z.boolean(),
  tokenAddress: z.string(),
  tokenCategory: z.string().optional(),
  chainId: z.number(),
  timestamp: z.number(),
  verificationStatus: z.string().optional()
});

const evalDenyResultSchema = z.object({
  reason: z.string(),
  tokenAddress: z.string(),
  chainId: z.number(),
  timestamp: z.number(),
  suggestedAlternatives: z.array(z.string()).optional(),
  blocklistReason: z.string().optional()
});

// ============ Helper Functions ============

/**
 * Normalize token address to lowercase
 */
function normalizeTokenAddress (address) {
  return address.toLowerCase();
}

/**
 * Check if token is in allowlist
 */
function isTokenAllowed (tokenAddress, allowedTokens) {
  const normalizedAddress = normalizeTokenAddress(tokenAddress);
  const normalizedAllowlist = allowedTokens.map(addr => normalizeTokenAddress(addr));
  return normalizedAllowlist.includes(normalizedAddress);
}

/**
 * Get token category
 */
function getTokenCategory (tokenAddress, userParams) {
  const normalizedAddress = normalizeTokenAddress(tokenAddress);
  const { tokenCategories } = userParams;

  if (!tokenCategories) return 'unknown';

  for (const [category, tokens] of Object.entries(tokenCategories)) {
    if (tokens && tokens.map(t => normalizeTokenAddress(t)).includes(normalizedAddress)) {
      return category;
    }
  }

  return 'unknown';
}

/**
 * Get suggested alternative tokens
 */
function getSuggestedAlternatives (tokenAddress, userParams) {
  const { allowedTokens, tokenCategories } = userParams;

  // For denied tokens, suggest similar category tokens
  const tokenCategory = getTokenCategory(tokenAddress, userParams);

  if (tokenCategory === 'unknown') {
    // Return first 3 allowed tokens as alternatives
    return allowedTokens.slice(0, 3);
  }

  // Return tokens from same category
  if (tokenCategories && tokenCategories[tokenCategory]) {
    return tokenCategories[tokenCategory].slice(0, 3);
  }

  return allowedTokens.slice(0, 3);
}

/**
 * Verify token contract (simplified implementation)
 */
async function verifyTokenContract (tokenAddress, chainId) {
  try {
    // In production, this would verify:
    // - Contract exists and is not a proxy to malicious code
    // - Token implements ERC20 standard
    // - Token is not on known scam lists
    // - Token has sufficient liquidity

    // Known verified tokens for major chains
    const verifiedTokens = {
      1: [ // Ethereum
        '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
        '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        '0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4' // SOL
      ]
    };

    const chainTokens = verifiedTokens[chainId] || [];
    const normalizedAddress = normalizeTokenAddress(tokenAddress);

    return {
      verified: chainTokens.includes(normalizedAddress),
      symbol: getTokenSymbol(tokenAddress),
      name: getTokenName(tokenAddress)
    };
  } catch (error) {
    return {
      verified: false,
      symbol: 'UNKNOWN',
      name: 'Unknown Token'
    };
  }
}

/**
 * Get token symbol (simplified)
 */
function getTokenSymbol (tokenAddress) {
  const tokenSymbols = {
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
    '0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4': 'SOL'
  };

  return tokenSymbols[normalizeTokenAddress(tokenAddress)] || 'UNKNOWN';
}

/**
 * Get token name (simplified)
 */
function getTokenName (tokenAddress) {
  const tokenNames = {
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'Wrapped Bitcoin',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'Wrapped Ether',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'Tether USD',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USD Coin',
    '0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4': 'Wrapped SOL'
  };

  return tokenNames[normalizeTokenAddress(tokenAddress)] || 'Unknown Token';
}

/**
 * Check if chain is supported
 */
function isChainSupported (chainId, allowedChains) {
  return allowedChains.includes(chainId);
}

// ============ Create Vincent Policy ============
export const vincentPolicy = createVincentPolicy({
  packageName: '@regav-ai/vincent-policy-token-allowlist',

  toolParamsSchema,
  userParamsSchema,

  // ============ Precheck Function ============
  precheckAllowResultSchema,
  precheckDenyResultSchema,
  precheck: async ({ toolParams, userParams }, policyContext) => {
    const { tokenAddress, chainId } = toolParams;
    const { allowedTokens, allowedChains, strictMode, allowUnknownTokens, requireTokenVerification } = userParams;

    try {
      // ============ Check Chain Support ============
      const chainSupported = isChainSupported(chainId, allowedChains);

      if (!chainSupported) {
        return policyContext.deny({
          reason: `Chain ${chainId} not supported. Allowed chains: ${allowedChains.join(', ')}`,
          tokenAddress,
          isAllowed: false,
          chainSupported: false,
          allowedTokens,
          suggestedAlternatives: getSuggestedAlternatives(tokenAddress, userParams)
        });
      }

      // ============ Check Token Allowlist ============
      const isAllowed = isTokenAllowed(tokenAddress, allowedTokens);

      if (!isAllowed && strictMode && !allowUnknownTokens) {
        return policyContext.deny({
          reason: `Token ${tokenAddress} not in allowlist`,
          tokenAddress,
          isAllowed: false,
          chainSupported: true,
          allowedTokens,
          suggestedAlternatives: getSuggestedAlternatives(tokenAddress, userParams)
        });
      }

      // ============ Verify Token Contract ============
      let tokenVerification = { verified: true, symbol: 'UNKNOWN', name: 'Unknown' };

      if (requireTokenVerification) {
        tokenVerification = await verifyTokenContract(tokenAddress, chainId);

        if (!tokenVerification.verified && strictMode) {
          return policyContext.deny({
            reason: `Token ${tokenAddress} failed verification checks`,
            tokenAddress,
            isAllowed: false,
            chainSupported: true,
            allowedTokens,
            tokenVerified: false,
            suggestedAlternatives: getSuggestedAlternatives(tokenAddress, userParams)
          });
        }
      }

      // ============ Get Token Category ============
      const tokenCategory = getTokenCategory(tokenAddress, userParams);

      // ============ Allow Token ============
      return policyContext.allow({
        tokenAddress,
        isAllowed: true,
        tokenCategory,
        chainSupported: true,
        allowedTokens,
        tokenVerified: tokenVerification.verified,
        tokenSymbol: tokenVerification.symbol,
        tokenName: tokenVerification.name
      });
    } catch (error) {
      return policyContext.deny({
        reason: `Policy precheck error: ${error.message}`,
        tokenAddress,
        isAllowed: false,
        chainSupported: false,
        allowedTokens,
        tokenVerified: false
      });
    }
  },

  // ============ Evaluate Function ============
  evalAllowResultSchema,
  evalDenyResultSchema,
  evaluate: async ({ toolParams, userParams }, policyContext) => {
    const { tokenAddress, chainId } = toolParams;
    const { allowedTokens, allowedChains, strictMode, allowUnknownTokens, requireTokenVerification } = userParams;
    const timestamp = Date.now();

    try {
      // ============ Check Chain Support ============
      const chainSupported = isChainSupported(chainId, allowedChains);

      if (!chainSupported) {
        return policyContext.deny({
          reason: `Chain ${chainId} not supported for token transactions`,
          tokenAddress,
          chainId,
          timestamp,
          suggestedAlternatives: getSuggestedAlternatives(tokenAddress, userParams)
        });
      }

      // ============ Check Token Allowlist ============
      const isAllowed = isTokenAllowed(tokenAddress, allowedTokens);

      if (!isAllowed && strictMode && !allowUnknownTokens) {
        return policyContext.deny({
          reason: `Token ${tokenAddress} is not in the approved allowlist`,
          tokenAddress,
          chainId,
          timestamp,
          suggestedAlternatives: getSuggestedAlternatives(tokenAddress, userParams),
          blocklistReason: 'Not in allowlist'
        });
      }

      // ============ Verify Token Contract ============
      let verificationStatus = 'not_required';

      if (requireTokenVerification) {
        const tokenVerification = await verifyTokenContract(tokenAddress, chainId);
        verificationStatus = tokenVerification.verified ? 'verified' : 'failed';

        if (!tokenVerification.verified && strictMode) {
          return policyContext.deny({
            reason: `Token ${tokenAddress} failed security verification`,
            tokenAddress,
            chainId,
            timestamp,
            suggestedAlternatives: getSuggestedAlternatives(tokenAddress, userParams),
            blocklistReason: 'Failed verification'
          });
        }
      }

      // ============ Get Token Category ============
      const tokenCategory = getTokenCategory(tokenAddress, userParams);

      // ============ Allow Token ============
      return policyContext.allow({
        approved: true,
        tokenAddress,
        tokenCategory,
        chainId,
        timestamp,
        verificationStatus
      });
    } catch (error) {
      return policyContext.deny({
        reason: `Policy evaluation error: ${error.message}`,
        tokenAddress,
        chainId,
        timestamp,
        blocklistReason: 'Evaluation error'
      });
    }
  }

  // Note: No commit function needed for this policy as it doesn't track state
});

export default vincentPolicy;
