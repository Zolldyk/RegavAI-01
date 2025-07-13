// ============================================================================
// Official Vincent ERC20 Trading Tool Implementation
// ============================================================================

import { createVincentTool, createVincentToolPolicy, supportedPoliciesForTool } from '@lit-protocol/vincent-tool-sdk';
import { z } from 'zod';
import { ethers } from 'ethers';

// ============ Tool Parameter Schema ============
const toolParamsSchema = z.object({
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
  amountToSend: z.number().positive('Amount must be positive'),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address'),
  reason: z.string().min(1, 'Reason is required'),
  chainId: z.number().optional().default(1), // Ethereum mainnet default
  maxGasPrice: z.number().optional(), // Optional gas price limit
  deadline: z.number().optional() // Optional deadline for trade expiry
});

// ============ Success/Fail Schemas ============
const precheckSuccessSchema = z.object({
  erc20TokenBalance: z.number(),
  nativeTokenBalance: z.number(),
  estimatedGas: z.number(),
  gasPrice: z.number(),
  canExecute: z.boolean(),
  estimatedCost: z.number()
});

const precheckFailSchema = z.object({
  reason: z.string(),
  currentBalance: z.number().optional(),
  requiredAmount: z.number().optional(),
  errorCode: z.string().optional(),
  gasEstimationFailed: z.boolean().optional()
});

const executeSuccessSchema = z.object({
  transferTransactionHash: z.string(),
  actualGasUsed: z.number(),
  actualGasPrice: z.number(),
  totalCost: z.number(),
  blockNumber: z.number(),
  timestamp: z.number(),
  policyCommitments: z.array(z.object({
    policyName: z.string(),
    committed: z.boolean(),
    commitHash: z.string().optional()
  })).optional()
});

const executeFailSchema = z.object({
  error: z.string(),
  errorCode: z.string(),
  revertReason: z.string().optional(),
  gasUsed: z.number().optional(),
  transactionHash: z.string().optional(),
  timestamp: z.number()
});

// ============ Helper Functions ============

/**
 * Get ERC20 token balance for an address
 */
async function getErc20TokenBalance(userAddress, tokenAddress) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC_URL);
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ],
      provider
    );
    
    const [balance, decimals] = await Promise.all([
      tokenContract.balanceOf(userAddress),
      tokenContract.decimals()
    ]);
    
    return parseFloat(ethers.utils.formatUnits(balance, decimals));
  } catch (error) {
    throw new Error(`Failed to get token balance: ${error.message}`);
  }
}

/**
 * Get native token (ETH) balance for an address
 */
async function getNativeTokenBalance(userAddress) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC_URL);
    const balance = await provider.getBalance(userAddress);
    return parseFloat(ethers.utils.formatEther(balance));
  } catch (error) {
    throw new Error(`Failed to get native balance: ${error.message}`);
  }
}

/**
 * Create ERC20 transfer transaction
 */
function createErc20TransferTransaction(tokenAddress, recipientAddress, amountToSend) {
  const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC_URL);
  const tokenContract = new ethers.Contract(
    tokenAddress,
    [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)'
    ],
    provider
  );
  
  return {
    contract: tokenContract,
    method: 'transfer',
    params: [recipientAddress, amountToSend],
    estimateGas: async () => {
      const decimals = await tokenContract.decimals();
      const amount = ethers.utils.parseUnits(amountToSend.toString(), decimals);
      return await tokenContract.estimateGas.transfer(recipientAddress, amount);
    },
    send: async (signer) => {
      const contractWithSigner = tokenContract.connect(signer);
      const decimals = await tokenContract.decimals();
      const amount = ethers.utils.parseUnits(amountToSend.toString(), decimals);
      const tx = await contractWithSigner.transfer(recipientAddress, amount);
      return await tx.wait();
    }
  };
}

// ============ Create Vincent Tool ============
export const vincentTool = createVincentTool({
  packageName: '@regav-ai/vincent-tool-erc20-trading',
  toolDescription: 'Execute ERC20 token transfers with policy governance for trading applications',

  toolParamsSchema,

  supportedPolicies: supportedPoliciesForTool([
    // Policies will be added when we create them
  ]),

  // ============ Precheck Function ============
  precheckSuccessSchema,
  precheckFailSchema,
  precheck: async ({ toolParams }, toolContext) => {
    const { tokenAddress, amountToSend, recipientAddress, chainId } = toolParams;
    const userAddress = toolContext.delegation.delegatorPkpInfo.ethAddress;

    try {
      // ============ Validate Addresses ============
      if (!ethers.utils.isAddress(tokenAddress)) {
        return toolContext.fail({
          reason: 'Invalid token address format',
          errorCode: 'INVALID_TOKEN_ADDRESS'
        });
      }

      if (!ethers.utils.isAddress(recipientAddress)) {
        return toolContext.fail({
          reason: 'Invalid recipient address format',
          errorCode: 'INVALID_RECIPIENT_ADDRESS'
        });
      }

      // ============ Check Token Balance ============
      const erc20TokenBalance = await getErc20TokenBalance(userAddress, tokenAddress);
      
      if (erc20TokenBalance < amountToSend) {
        return toolContext.fail({
          reason: 'Insufficient token balance',
          currentBalance: erc20TokenBalance,
          requiredAmount: amountToSend,
          errorCode: 'INSUFFICIENT_TOKEN_BALANCE'
        });
      }

      // ============ Create Transaction for Gas Estimation ============
      const transferTransaction = createErc20TransferTransaction(
        tokenAddress,
        recipientAddress,
        amountToSend
      );

      let estimatedGas;
      let gasPrice;
      
      try {
        // Estimate gas for the transaction
        estimatedGas = await transferTransaction.estimateGas();
        
        // Get current gas price
        const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC_URL);
        gasPrice = await provider.getGasPrice();
        gasPrice = parseFloat(ethers.utils.formatUnits(gasPrice, 'gwei'));
        
      } catch (gasError) {
        if (gasError.code === 'UNPREDICTABLE_GAS_LIMIT') {
          return toolContext.fail({
            reason: 'Transaction would revert during execution',
            errorCode: 'TRANSACTION_WOULD_REVERT',
            revertReason: gasError.reason || 'Unknown revert reason',
            gasEstimationFailed: true
          });
        }
        throw gasError;
      }

      // ============ Check Native Token Balance for Gas ============
      const nativeTokenBalance = await getNativeTokenBalance(userAddress);
      const estimatedGasCost = parseFloat(ethers.utils.formatEther(
        ethers.BigNumber.from(estimatedGas).mul(ethers.utils.parseUnits(gasPrice.toString(), 'gwei'))
      ));

      if (nativeTokenBalance < estimatedGasCost) {
        return toolContext.fail({
          reason: 'Insufficient native token balance for gas',
          currentBalance: nativeTokenBalance,
          requiredAmount: estimatedGasCost,
          errorCode: 'INSUFFICIENT_GAS_BALANCE'
        });
      }

      // ============ Return Success Result ============
      return toolContext.succeed({
        erc20TokenBalance,
        nativeTokenBalance,
        estimatedGas: parseInt(estimatedGas.toString()),
        gasPrice,
        canExecute: true,
        estimatedCost: estimatedGasCost
      });

    } catch (error) {
      return toolContext.fail({
        reason: `Precheck failed: ${error.message}`,
        errorCode: 'PRECHECK_ERROR'
      });
    }
  },

  // ============ Execute Function ============
  executeSuccessSchema,
  executeFailSchema,
  execute: async ({ toolParams }, toolContext) => {
    const { tokenAddress, amountToSend, recipientAddress, deadline } = toolParams;
    const startTime = Date.now();

    try {
      // ============ Check Deadline ============
      if (deadline && Date.now() > deadline) {
        return toolContext.fail({
          error: 'Trade deadline exceeded',
          errorCode: 'DEADLINE_EXCEEDED',
          timestamp: Date.now()
        });
      }

      // ============ Create and Execute Transaction ============
      const transferTransaction = createErc20TransferTransaction(
        tokenAddress,
        recipientAddress,
        amountToSend
      );

      // Create signer from delegator PKP
      const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC_URL);
      const wallet = new ethers.Wallet(toolContext.delegation.delegatorPkpInfo.privateKey, provider);

      // Execute the transaction
      const txReceipt = await transferTransaction.send(wallet);

      // ============ Process Policy Commitments ============
      const policyCommitments = [];
      const { policiesContext } = toolContext;

      if (policiesContext.allowedPolicies) {
        for (const [policyPackageName, policyContext] of Object.entries(policiesContext.allowedPolicies)) {
          if (policyContext.commit) {
            try {
              const commitResult = await policyContext.commit({
                spentAmount: amountToSend,
                tokenAddress,
                transactionHash: txReceipt.transactionHash,
                gasUsed: txReceipt.gasUsed.toNumber(),
                blockNumber: txReceipt.blockNumber
              });

              policyCommitments.push({
                policyName: policyPackageName,
                committed: commitResult.allow,
                commitHash: commitResult.result?.transactionHash
              });

              if (!commitResult.allow) {
                return toolContext.fail({
                  error: `Policy commit failed: ${commitResult.error || 'Unknown error'}`,
                  errorCode: 'POLICY_COMMIT_FAILED',
                  timestamp: Date.now()
                });
              }
            } catch (commitError) {
              return toolContext.fail({
                error: `Policy commit error: ${commitError.message}`,
                errorCode: 'POLICY_COMMIT_ERROR',
                timestamp: Date.now()
              });
            }
          }
        }
      }

      // ============ Return Success Result ============
      return toolContext.succeed({
        transferTransactionHash: txReceipt.transactionHash,
        actualGasUsed: txReceipt.gasUsed.toNumber(),
        actualGasPrice: parseFloat(ethers.utils.formatUnits(txReceipt.effectiveGasPrice, 'gwei')),
        totalCost: parseFloat(ethers.utils.formatEther(
          txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice)
        )),
        blockNumber: txReceipt.blockNumber,
        timestamp: Date.now(),
        policyCommitments
      });

    } catch (error) {
      return toolContext.fail({
        error: `Execution failed: ${error.message}`,
        errorCode: error.code || 'EXECUTION_ERROR',
        revertReason: error.reason,
        timestamp: Date.now()
      });
    }
  }
});

export default vincentTool;