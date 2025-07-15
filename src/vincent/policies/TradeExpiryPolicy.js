// ============================================================================
// Trade Expiry Policy - Vincent Policy Implementation
// ============================================================================

import { createVincentPolicy } from '@lit-protocol/vincent-tool-sdk';
import { z } from 'zod';

// ============ Parameter Schemas ============
const toolParamsSchema = z.object({
  deadline: z.number().optional(), // Trade deadline timestamp
  orderCreatedAt: z.number().optional(), // When order was created
  orderType: z.string().optional().default('market'), // market, limit, stop
  tokenAddress: z.string(),
  amountToSend: z.number(),
  chainId: z.number().optional().default(1)
});

const userParamsSchema = z.object({
  expiryTimeSeconds: z.number().default(600), // 10 minutes default
  allowedChains: z.array(z.number()).default([1, 10, 42161, 8453, 137]), // Multi-chain support
  enforceStrictExpiry: z.boolean().default(true), // Strict enforcement
  maxExpiryTimeSeconds: z.number().default(3600), // Maximum 1 hour
  minExpiryTimeSeconds: z.number().default(60), // Minimum 1 minute
  orderTypeExpiryOverrides: z.object({
    market: z.number().optional(),
    limit: z.number().optional(),
    stop: z.number().optional()
  }).optional()
});

// ============ Result Schemas ============
const precheckAllowResultSchema = z.object({
  expiryTimeSeconds: z.number(),
  currentTimestamp: z.number(),
  orderCreatedAt: z.number(),
  deadlineTimestamp: z.number(),
  timeRemaining: z.number(),
  isExpired: z.boolean(),
  chainSupported: z.boolean()
});

const precheckDenyResultSchema = z.object({
  reason: z.string(),
  expiryTimeSeconds: z.number(),
  currentTimestamp: z.number(),
  orderCreatedAt: z.number(),
  deadlineTimestamp: z.number(),
  timeRemaining: z.number(),
  isExpired: z.boolean(),
  chainSupported: z.boolean()
});

const evalAllowResultSchema = z.object({
  approved: z.boolean(),
  expiryTimeSeconds: z.number(),
  deadlineTimestamp: z.number(),
  timeRemaining: z.number(),
  chainId: z.number(),
  orderType: z.string(),
  timestamp: z.number()
});

const evalDenyResultSchema = z.object({
  reason: z.string(),
  expiryTimeSeconds: z.number(),
  deadlineTimestamp: z.number(),
  timeRemaining: z.number(),
  expiredBy: z.number(),
  chainId: z.number(),
  orderType: z.string(),
  timestamp: z.number()
});

const commitParamsSchema = z.object({
  orderExecutedAt: z.number(),
  executionTimestamp: z.number(),
  transactionHash: z.string(),
  chainId: z.number()
});

const commitAllowResultSchema = z.object({
  orderCancelled: z.boolean(),
  executionRecorded: z.boolean(),
  executionTimestamp: z.number(),
  transactionHash: z.string().optional()
});

const commitDenyResultSchema = z.object({
  reason: z.string(),
  orderCancelled: z.boolean(),
  executionTimestamp: z.number()
});

// ============ Helper Functions ============

/**
 * Calculate effective expiry time based on order type
 */
function getEffectiveExpiryTime (orderType, userParams) {
  const { expiryTimeSeconds, orderTypeExpiryOverrides } = userParams;

  if (orderTypeExpiryOverrides && orderTypeExpiryOverrides[orderType]) {
    return orderTypeExpiryOverrides[orderType];
  }

  return expiryTimeSeconds;
}

/**
 * Validate expiry time against min/max bounds
 */
function validateExpiryTime (expiryTimeSeconds, userParams) {
  const { minExpiryTimeSeconds, maxExpiryTimeSeconds } = userParams;

  if (expiryTimeSeconds < minExpiryTimeSeconds) {
    throw new Error(`Expiry time ${expiryTimeSeconds}s is below minimum ${minExpiryTimeSeconds}s`);
  }

  if (expiryTimeSeconds > maxExpiryTimeSeconds) {
    throw new Error(`Expiry time ${expiryTimeSeconds}s exceeds maximum ${maxExpiryTimeSeconds}s`);
  }

  return true;
}

// Helper functions for future use
// function _isOrderExpired (orderCreatedAt, expiryTimeSeconds, currentTimestamp) {
//   const deadlineTimestamp = orderCreatedAt + (expiryTimeSeconds * 1000);
//   return currentTimestamp > deadlineTimestamp;
// }

// function _getTimeRemaining (orderCreatedAt, expiryTimeSeconds, currentTimestamp) {
//   const deadlineTimestamp = orderCreatedAt + (expiryTimeSeconds * 1000);
//   return Math.max(0, deadlineTimestamp - currentTimestamp);
// }

/**
 * Check if chain is supported
 */
function isChainSupported (chainId, allowedChains) {
  return allowedChains.includes(chainId);
}

// ============ Create Vincent Policy ============
export const vincentPolicy = createVincentPolicy({
  packageName: '@regav-ai/vincent-policy-trade-expiry',

  toolParamsSchema,
  userParamsSchema,

  // ============ Precheck Function ============
  precheckAllowResultSchema,
  precheckDenyResultSchema,
  precheck: async ({ toolParams, userParams }, policyContext) => {
    const { deadline, orderCreatedAt, orderType, chainId } = toolParams;
    const { allowedChains, enforceStrictExpiry } = userParams;
    const currentTimestamp = Date.now();

    try {
      // ============ Check Chain Support ============
      const chainSupported = isChainSupported(chainId, allowedChains);

      if (!chainSupported) {
        return policyContext.deny({
          reason: `Chain ${chainId} not supported. Allowed chains: ${allowedChains.join(', ')}`,
          expiryTimeSeconds: 0,
          currentTimestamp,
          orderCreatedAt: orderCreatedAt || currentTimestamp,
          deadlineTimestamp: 0,
          timeRemaining: 0,
          isExpired: true,
          chainSupported: false
        });
      }

      // ============ Determine Order Creation Time ============
      const actualOrderCreatedAt = orderCreatedAt || currentTimestamp;

      // ============ Get Effective Expiry Time ============
      const effectiveExpiryTime = getEffectiveExpiryTime(orderType, userParams);

      // ============ Validate Expiry Time ============
      validateExpiryTime(effectiveExpiryTime, userParams);

      // ============ Check for Custom Deadline ============
      let deadlineTimestamp;
      if (deadline) {
        deadlineTimestamp = deadline;
      } else {
        deadlineTimestamp = actualOrderCreatedAt + (effectiveExpiryTime * 1000);
      }

      // ============ Check if Order Has Expired ============
      const isExpired = currentTimestamp > deadlineTimestamp;
      const timeRemaining = Math.max(0, deadlineTimestamp - currentTimestamp);

      if (isExpired && enforceStrictExpiry) {
        return policyContext.deny({
          reason: `Order expired ${Math.round((currentTimestamp - deadlineTimestamp) / 1000)}s ago`,
          expiryTimeSeconds: effectiveExpiryTime,
          currentTimestamp,
          orderCreatedAt: actualOrderCreatedAt,
          deadlineTimestamp,
          timeRemaining: 0,
          isExpired: true,
          chainSupported: true
        });
      }

      // ============ Allow Trade ============
      return policyContext.allow({
        expiryTimeSeconds: effectiveExpiryTime,
        currentTimestamp,
        orderCreatedAt: actualOrderCreatedAt,
        deadlineTimestamp,
        timeRemaining,
        isExpired: false,
        chainSupported: true
      });
    } catch (error) {
      return policyContext.deny({
        reason: `Policy precheck error: ${error.message}`,
        expiryTimeSeconds: 0,
        currentTimestamp,
        orderCreatedAt: orderCreatedAt || currentTimestamp,
        deadlineTimestamp: 0,
        timeRemaining: 0,
        isExpired: true,
        chainSupported: false
      });
    }
  },

  // ============ Evaluate Function ============
  evalAllowResultSchema,
  evalDenyResultSchema,
  evaluate: async ({ toolParams, userParams }, policyContext) => {
    const { deadline, orderCreatedAt, orderType, chainId } = toolParams;
    const { allowedChains, enforceStrictExpiry } = userParams;
    const currentTimestamp = Date.now();

    try {
      // ============ Check Chain Support ============
      const chainSupported = isChainSupported(chainId, allowedChains);

      if (!chainSupported) {
        return policyContext.deny({
          reason: `Chain ${chainId} not supported for trading`,
          expiryTimeSeconds: 0,
          deadlineTimestamp: 0,
          timeRemaining: 0,
          expiredBy: 0,
          chainId,
          orderType: orderType || 'unknown',
          timestamp: currentTimestamp
        });
      }

      // ============ Determine Order Creation Time ============
      const actualOrderCreatedAt = orderCreatedAt || currentTimestamp;

      // ============ Get Effective Expiry Time ============
      const effectiveExpiryTime = getEffectiveExpiryTime(orderType, userParams);

      // ============ Validate Expiry Time ============
      validateExpiryTime(effectiveExpiryTime, userParams);

      // ============ Check for Custom Deadline ============
      let deadlineTimestamp;
      if (deadline) {
        deadlineTimestamp = deadline;
      } else {
        deadlineTimestamp = actualOrderCreatedAt + (effectiveExpiryTime * 1000);
      }

      // ============ Check if Order Has Expired ============
      const timeRemaining = Math.max(0, deadlineTimestamp - currentTimestamp);
      const isExpired = currentTimestamp > deadlineTimestamp;

      if (isExpired && enforceStrictExpiry) {
        const expiredBy = currentTimestamp - deadlineTimestamp;

        return policyContext.deny({
          reason: `Order expired ${Math.round(expiredBy / 1000)} seconds ago`,
          expiryTimeSeconds: effectiveExpiryTime,
          deadlineTimestamp,
          timeRemaining: 0,
          expiredBy,
          chainId,
          orderType: orderType || 'market',
          timestamp: currentTimestamp
        });
      }

      // ============ Allow Trade ============
      return policyContext.allow({
        approved: true,
        expiryTimeSeconds: effectiveExpiryTime,
        deadlineTimestamp,
        timeRemaining,
        chainId,
        orderType: orderType || 'market',
        timestamp: currentTimestamp
      });
    } catch (error) {
      return policyContext.deny({
        reason: `Policy evaluation error: ${error.message}`,
        expiryTimeSeconds: 0,
        deadlineTimestamp: 0,
        timeRemaining: 0,
        expiredBy: 0,
        chainId,
        orderType: orderType || 'unknown',
        timestamp: currentTimestamp
      });
    }
  },

  // ============ Commit Function ============
  commitParamsSchema,
  commitAllowResultSchema,
  commitDenyResultSchema,
  commit: async (params, policyContext) => {
    const { executionTimestamp, transactionHash } = params;

    try {
      // ============ Record Successful Execution ============
      // In a real implementation, this would store execution data
      // and potentially cancel any pending orders

      return policyContext.allow({
        orderCancelled: false, // Order was executed, not cancelled
        executionRecorded: true,
        executionTimestamp,
        transactionHash
      });
    } catch (error) {
      return policyContext.deny({
        reason: `Failed to commit order execution: ${error.message}`,
        orderCancelled: false,
        executionTimestamp
      });
    }
  }
});

export default vincentPolicy;
