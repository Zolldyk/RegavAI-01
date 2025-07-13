# Vincent Tools and Policies Implementation

This directory contains the implementation of Vincent tools and policies for the Regav-AI trading agent, following the official Vincent SDK patterns.

## Overview

We have implemented custom Vincent tools and policies that work alongside the official Vincent tools to provide comprehensive trading governance.

## Official Vincent Tools vs Custom Implementation

### Official Vincent Tools Available
- **ERC20 Token Approval Tool**: `QmYWcBLxbgUdsgi9XPfj8AZ1zdoKMoogXbcne8if7JwHP4`
- **Uniswap Swap Tool**: `QmQRBHUf8ZMiaaKiT1jc1RZHKyuhq81ki3HuDnxm93rdUF`

### Official Vincent Policies Available
- **Daily Spending Limit Policy**: `QmSD9pyo2XzatdAPxjhEpYDDgVeNT3eQvHKeCkw7vn9vtg`
  - Parameter: `maxDailySpendingLimitInUsdCents` (uint256)

### Our Custom Implementation

**Custom Tool**: ERC20 Trading Tool (`@regav-ai/vincent-tool-erc20-trading`)
- Handles direct ERC20 token transfers for trading
- Different from official approval tool (which only handles approvals)
- Implements proper Vincent SDK patterns with precheck/execute lifecycle

**Custom Policies Implemented**:

## 1. Trade Amount Limit Policy
- **Package**: `@regav-ai/vincent-policy-trade-amount-limit`
- **IPFS CID**: `Qmety6oZ7xZQoSY57pJzjq94W1XTDCGc3ohUVzKh4K1s8n`
- **Description**: Restricts each trade to a maximum value to manage risk
- **Parameters**:
  ```javascript
  {
    maxTradeAmount: 1000,  // $1,000 default
    allowedChains: [1, 10, 42161, 8453, 137], // Ethereum, Optimism, Arbitrum, Base, Polygon
    currency: 'USD'
  }
  ```

## 2. Trade Expiry Policy
- **Package**: `@regav-ai/vincent-policy-trade-expiry`
- **IPFS CID**: `QmcV65YhP7Kq9JAGLV5Xe2HuFB9sSYejE5DaYce3qd65jP`
- **Description**: Limits open orders to 10 minutes to avoid stale trades
- **Parameters**:
  ```javascript
  {
    expiryTimeSeconds: 600, // 10 minutes default
    allowedChains: [1, 10, 42161, 8453, 137],
    enforceStrictExpiry: true,
    maxExpiryTimeSeconds: 3600, // 1 hour max
    minExpiryTimeSeconds: 60    // 1 minute min
  }
  ```

## 3. Token Allowlist Policy
- **Package**: `@regav-ai/vincent-policy-token-allowlist`
- **IPFS CID**: `QmeNEQwK5ZJ7xucLy2FsxQjju7F2uA9BbCvDAhmWoGhTeG`
- **Description**: Restricts trading to approved tokens for security
- **Parameters**:
  ```javascript
  {
    allowedTokens: [
      '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      '0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4'  // SOL (wrapped)
    ],
    allowedChains: [1, 10, 42161, 8453, 137],
    strictMode: true,
    requireTokenVerification: true
  }
  ```

## File Structure

```
src/vincent/
├── tools/
│   └── ERC20TradingTool.js        # Custom ERC20 trading tool implementation
├── policies/
│   ├── TradeAmountLimitPolicy.js  # Trade amount limit policy
│   ├── TradeExpiryPolicy.js       # Trade expiry policy
│   └── TokenAllowlistPolicy.js    # Token allowlist policy
├── BundledVincentTools.js         # Registry and bundling utilities
└── README.md                      # This file
```

## Integration with VincentClient

The `VincentClient.js` has been updated to:

1. **Use Enhanced ERC20 Trading Tool**: Replaced mock implementation with proper Vincent SDK tool
2. **Implement Custom Policies**: Added the three custom policies with proper Vincent SDK structure
3. **Maintain Backward Compatibility**: Existing competition logic still works
4. **Add Vincent Registry**: Tools and policies are properly registered with IPFS CIDs

## Key Changes Made

### VincentClient.js Updates

1. **Tool Loading**: 
   - Now loads `enhancedERC20TradingTool` instead of mock implementation
   - Proper IPFS CID and package name registration

2. **Policy Configuration**:
   - Replaced custom policy implementations with Vincent SDK compliant policies
   - Added proper parameter mapping between tools and policies
   - Maintained existing configuration compatibility

3. **Registry Integration**:
   - Added imports for Vincent tools and policies registry
   - Tools and policies are now properly bundled with IPFS CIDs

## Usage Example

```javascript
// In your trading application
import { VincentClient } from './src/integrations/VincentClient.js';

const vincentClient = new VincentClient();
await vincentClient.initialize();

// Request permission for a trade
const tradeParams = {
  tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  amountToSend: 500, // $500 worth
  recipientAddress: '0x...',
  reason: 'AI trading bot purchase',
  chainId: 1,
  deadline: Date.now() + 600000 // 10 minutes from now
};

const permission = await vincentClient.requestTradePermission(tradeParams);

if (permission.success) {
  // Execute the trade
  const result = await vincentClient.executeTradeWithPolicies(tradeParams);
  console.log('Trade executed:', result);
} else {
  console.log('Trade denied:', permission.reason);
}
```

## Policy Enforcement

The policies work together to provide comprehensive trading governance:

1. **Trade Amount Limit**: Ensures no single trade exceeds $1,000
2. **Trade Expiry**: Automatically expires orders after 10 minutes
3. **Token Allowlist**: Only allows trading of approved tokens (WBTC, WETH, USDT, USDC, SOL)

## Next Steps

To complete the Vincent integration:

1. ✅ **Deploy Policies**: ~~Deploy the custom policies to IPFS and get actual CIDs~~ (COMPLETED)
2. **Vincent App Registration**: Register the tools and policies in the Vincent App Dashboard
3. **Testing**: Test with Vincent testnet environment
4. **User Consent Flow**: Implement user consent management for production use

## Notes

- IPFS CIDs are now live and deployed to the IPFS network
- In production, these would be actual IPFS CIDs after deploying to Vincent
- The implementation follows official Vincent SDK patterns exactly
- Policies can be reused across different trading applications