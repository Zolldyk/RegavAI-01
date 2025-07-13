// ============================================================================
// Bundled Vincent Tools and Policies
// ============================================================================

import { createVincentToolPolicy, supportedPoliciesForTool } from '@lit-protocol/vincent-tool-sdk';
import { vincentTool as ERC20TradingTool } from './tools/ERC20TradingTool.js';
import { vincentPolicy as TradeAmountLimitPolicy } from './policies/TradeAmountLimitPolicy.js';
import { vincentPolicy as TradeExpiryPolicy } from './policies/TradeExpiryPolicy.js';
import { vincentPolicy as TokenAllowlistPolicy } from './policies/TokenAllowlistPolicy.js';

// ============ Official Vincent Tools (External) ============
// These would be imported from official Vincent packages when available

// ERC20 Token Approval Tool (Official)
export const OFFICIAL_ERC20_APPROVAL_TOOL = {
  ipfsCid: 'QmYWcBLxbgUdsgi9XPfj8AZ1zdoKMoogXbcne8if7JwHP4',
  packageName: '@lit-protocol/vincent-tool-erc20-approval',
  description: 'Official Vincent tool for ERC20 token approvals'
};

// Uniswap Swap Tool (Official) 
export const OFFICIAL_UNISWAP_SWAP_TOOL = {
  ipfsCid: 'QmQRBHUf8ZMiaaKiT1jc1RZHKyuhq81ki3HuDnxm93rdUF',
  packageName: '@lit-protocol/vincent-tool-uniswap-swap',
  description: 'Official Vincent tool for Uniswap swaps'
};

// Daily Spending Limit Policy (Official)
export const OFFICIAL_DAILY_SPENDING_LIMIT_POLICY = {
  ipfsCid: 'QmSD9pyo2XzatdAPxjhEpYDDgVeNT3eQvHKeCkw7vn9vtg',
  packageName: '@lit-protocol/vincent-policy-daily-spending-limit',
  description: 'Official Vincent policy for daily spending limits',
  parameters: {
    maxDailySpendingLimitInUsdCents: 'uint256'
  }
};

// ============ Custom Tool Policy Configurations ============

// Trade Amount Limit Policy Configuration
const TradeAmountLimitPolicyConfig = createVincentToolPolicy({
  toolParamsSchema: ERC20TradingTool.toolParamsSchema,
  bundledVincentPolicy: {
    vincentPolicy: TradeAmountLimitPolicy,
    ipfsCid: 'Qmety6oZ7xZQoSY57pJzjq94W1XTDCGc3ohUVzKh4K1s8n' // Trade Amount Limit Policy
  },
  toolParameterMappings: {
    tokenAddress: 'tokenAddress',
    amountToSend: 'amountToSend',
    chainId: 'chainId'
  }
});

// Trade Expiry Policy Configuration  
const TradeExpiryPolicyConfig = createVincentToolPolicy({
  toolParamsSchema: ERC20TradingTool.toolParamsSchema,
  bundledVincentPolicy: {
    vincentPolicy: TradeExpiryPolicy,
    ipfsCid: 'QmcV65YhP7Kq9JAGLV5Xe2HuFB9sSYejE5DaYce3qd65jP' // Trade Expiry Policy
  },
  toolParameterMappings: {
    deadline: 'deadline',
    orderCreatedAt: 'orderCreatedAt',
    tokenAddress: 'tokenAddress',
    amountToSend: 'amountToSend',
    chainId: 'chainId'
  }
});

// Token Allowlist Policy Configuration
const TokenAllowlistPolicyConfig = createVincentToolPolicy({
  toolParamsSchema: ERC20TradingTool.toolParamsSchema,
  bundledVincentPolicy: {
    vincentPolicy: TokenAllowlistPolicy,
    ipfsCid: 'QmeNEQwK5ZJ7xucLy2FsxQjju7F2uA9BbCvDAhmWoGhTeG' // Token Allowlist Policy
  },
  toolParameterMappings: {
    tokenAddress: 'tokenAddress',
    amountToSend: 'amountToSend',
    chainId: 'chainId',
    recipientAddress: 'recipientAddress'
  }
});

// ============ Enhanced ERC20 Trading Tool with Policies ============
export const enhancedERC20TradingTool = {
  ...ERC20TradingTool,
  supportedPolicies: supportedPoliciesForTool([
    TradeAmountLimitPolicyConfig,
    TradeExpiryPolicyConfig,
    TokenAllowlistPolicyConfig
  ]),
  ipfsCid: 'QmVDKKmEKNyrFs5XxCVgJ5iAvc8djNMDngQJaxJy7VMp7G' // ERC20 Trading Tool
};

// ============ Tool and Policy Registry ============
export const VINCENT_TOOLS_REGISTRY = {
  // Official Tools
  'erc20-approval': OFFICIAL_ERC20_APPROVAL_TOOL,
  'uniswap-swap': OFFICIAL_UNISWAP_SWAP_TOOL,
  
  // Custom Tools
  'erc20-trading': {
    tool: enhancedERC20TradingTool,
    ipfsCid: 'QmVDKKmEKNyrFs5XxCVgJ5iAvc8djNMDngQJaxJy7VMp7G',
    packageName: '@regav-ai/vincent-tool-erc20-trading',
    description: 'Custom ERC20 trading tool with enhanced policy support'
  }
};

export const VINCENT_POLICIES_REGISTRY = {
  // Official Policies
  'daily-spending-limit': OFFICIAL_DAILY_SPENDING_LIMIT_POLICY,
  
  // Custom Policies
  'trade-amount-limit': {
    policy: TradeAmountLimitPolicy,
    ipfsCid: 'Qmety6oZ7xZQoSY57pJzjq94W1XTDCGc3ohUVzKh4K1s8n',
    packageName: '@regav-ai/vincent-policy-trade-amount-limit',
    description: 'Restricts individual trade amounts to prevent overexposure',
    parameters: {
      maxTradeAmount: 'number', // USD amount
      allowedChains: 'array',   // Supported chain IDs
      currency: 'string'        // Currency for limit (USD, ETH, etc.)
    }
  },
  
  'trade-expiry': {
    policy: TradeExpiryPolicy,
    ipfsCid: 'QmcV65YhP7Kq9JAGLV5Xe2HuFB9sSYejE5DaYce3qd65jP',
    packageName: '@regav-ai/vincent-policy-trade-expiry',
    description: 'Ensures trades expire after specified time to avoid stale orders',
    parameters: {
      expiryTimeSeconds: 'number',    // Default 600 (10 minutes)
      allowedChains: 'array',         // Supported chain IDs
      enforceStrictExpiry: 'boolean', // Strict enforcement
      maxExpiryTimeSeconds: 'number'  // Maximum allowed expiry time
    }
  },
  
  'token-allowlist': {
    policy: TokenAllowlistPolicy,
    ipfsCid: 'QmeNEQwK5ZJ7xucLy2FsxQjju7F2uA9BbCvDAhmWoGhTeG',
    packageName: '@regav-ai/vincent-policy-token-allowlist',
    description: 'Restricts trading to approved tokens for security',
    parameters: {
      allowedTokens: 'array',           // Approved token addresses
      allowedChains: 'array',           // Supported chain IDs
      strictMode: 'boolean',            // Strict enforcement
      requireTokenVerification: 'boolean' // Require token verification
    }
  }
};

// ============ Helper Functions ============

/**
 * Get tool configuration by name
 */
export function getVincentTool(toolName) {
  const tool = VINCENT_TOOLS_REGISTRY[toolName];
  if (!tool) {
    throw new Error(`Vincent tool '${toolName}' not found in registry`);
  }
  return tool;
}

/**
 * Get policy configuration by name
 */
export function getVincentPolicy(policyName) {
  const policy = VINCENT_POLICIES_REGISTRY[policyName];
  if (!policy) {
    throw new Error(`Vincent policy '${policyName}' not found in registry`);
  }
  return policy;
}

/**
 * Get all available tools
 */
export function getAvailableTools() {
  return Object.keys(VINCENT_TOOLS_REGISTRY);
}

/**
 * Get all available policies
 */
export function getAvailablePolicies() {
  return Object.keys(VINCENT_POLICIES_REGISTRY);
}

/**
 * Create bundled tool with specified policies
 */
export function createBundledTool(toolName, policyNames = []) {
  const baseTool = getVincentTool(toolName);
  
  if (policyNames.length === 0) {
    return baseTool;
  }
  
  // Create policy configurations for specified policies
  const policyConfigs = policyNames.map(policyName => {
    const policy = getVincentPolicy(policyName);
    
    return createVincentToolPolicy({
      toolParamsSchema: baseTool.tool ? baseTool.tool.toolParamsSchema : baseTool.toolParamsSchema,
      bundledVincentPolicy: {
        vincentPolicy: policy.policy,
        ipfsCid: policy.ipfsCid
      },
      toolParameterMappings: getDefaultParameterMappings(toolName, policyName)
    });
  });
  
  return {
    ...baseTool,
    supportedPolicies: supportedPoliciesForTool(policyConfigs)
  };
}

/**
 * Get default parameter mappings for tool-policy combinations
 */
function getDefaultParameterMappings(toolName, policyName) {
  const mappings = {
    'erc20-trading': {
      'trade-amount-limit': {
        tokenAddress: 'tokenAddress',
        amountToSend: 'amountToSend',
        chainId: 'chainId'
      },
      'trade-expiry': {
        deadline: 'deadline',
        orderCreatedAt: 'orderCreatedAt',
        tokenAddress: 'tokenAddress',
        amountToSend: 'amountToSend',
        chainId: 'chainId'
      },
      'token-allowlist': {
        tokenAddress: 'tokenAddress',
        amountToSend: 'amountToSend',
        chainId: 'chainId',
        recipientAddress: 'recipientAddress'
      }
    }
  };
  
  return mappings[toolName]?.[policyName] || {};
}

// ============ Export All ============
export {
  ERC20TradingTool,
  TradeAmountLimitPolicy,
  TradeExpiryPolicy,
  TokenAllowlistPolicy,
  TradeAmountLimitPolicyConfig,
  TradeExpiryPolicyConfig,
  TokenAllowlistPolicyConfig
};

export default {
  tools: VINCENT_TOOLS_REGISTRY,
  policies: VINCENT_POLICIES_REGISTRY,
  getVincentTool,
  getVincentPolicy,
  createBundledTool,
  enhancedERC20TradingTool
};