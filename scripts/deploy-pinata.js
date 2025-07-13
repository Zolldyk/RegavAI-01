#!/usr/bin/env node

// ============================================================================
// Deploy Vincent Policies to Pinata IPFS
// ============================================================================

import { PinataSDK } from 'pinata-web3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ Configuration ============
// Set these environment variables or replace with your actual values
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'gateway.pinata.cloud';

if (!PINATA_JWT) {
  console.error('❌ PINATA_JWT environment variable is required');
  console.log('Get your JWT from: https://app.pinata.cloud/developers/api-keys');
  process.exit(1);
}

const pinata = new PinataSDK({
  pinataJwt: PINATA_JWT,
  pinataGateway: PINATA_GATEWAY
});

// ============ Policy Files ============
const policies = [
  {
    name: 'TradeAmountLimitPolicy',
    file: '../src/vincent/policies/TradeAmountLimitPolicy.js',
    metadata: {
      name: 'Trade Amount Limit Policy',
      description: 'Restricts individual trade amounts to prevent overexposure',
      packageName: '@regav-ai/vincent-policy-trade-amount-limit',
      version: '1.0.0',
      type: 'vincent-policy'
    }
  },
  {
    name: 'TradeExpiryPolicy',
    file: '../src/vincent/policies/TradeExpiryPolicy.js',
    metadata: {
      name: 'Trade Expiry Policy',
      description: 'Ensures trades expire after specified time to avoid stale orders',
      packageName: '@regav-ai/vincent-policy-trade-expiry',
      version: '1.0.0',
      type: 'vincent-policy'
    }
  },
  {
    name: 'TokenAllowlistPolicy',
    file: '../src/vincent/policies/TokenAllowlistPolicy.js',
    metadata: {
      name: 'Token Allowlist Policy',
      description: 'Restricts trading to approved tokens for security',
      packageName: '@regav-ai/vincent-policy-token-allowlist',
      version: '1.0.0',
      type: 'vincent-policy'
    }
  }
];

const tools = [
  {
    name: 'ERC20TradingTool',
    file: '../src/vincent/tools/ERC20TradingTool.js',
    metadata: {
      name: 'ERC20 Trading Tool',
      description: 'Execute ERC20 token transfers with policy governance',
      packageName: '@regav-ai/vincent-tool-erc20-trading',
      version: '1.0.0',
      type: 'vincent-tool'
    }
  }
];

// ============ Deployment Functions ============

async function deployFile(item) {
  try {
    console.log(`📦 Deploying ${item.name}...`);
    
    const filePath = path.resolve(__dirname, item.file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    const file = new File([fileContent], `${item.name}.js`, {
      type: 'application/javascript'
    });
    
    const upload = await pinata.upload.file(file).addMetadata(item.metadata);
    
    console.log(`✅ ${item.name} deployed successfully!`);
    console.log(`   IPFS CID: ${upload.IpfsHash}`);
    console.log(`   Pinata URL: https://${PINATA_GATEWAY}/ipfs/${upload.IpfsHash}`);
    
    return {
      name: item.name,
      ipfsCid: upload.IpfsHash,
      pinataUrl: `https://${PINATA_GATEWAY}/ipfs/${upload.IpfsHash}`,
      metadata: item.metadata
    };
    
  } catch (error) {
    console.error(`❌ Failed to deploy ${item.name}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting Pinata IPFS Deployment...\n');
  
  // Test Pinata connection
  try {
    await pinata.testAuthentication();
    console.log('✅ Pinata authentication successful\n');
  } catch (error) {
    console.error('❌ Pinata authentication failed:', error.message);
    return;
  }
  
  const deploymentResults = {
    policies: {},
    tools: {},
    timestamp: new Date().toISOString(),
    gateway: PINATA_GATEWAY
  };
  
  // Deploy Policies
  console.log('📋 Deploying Vincent Policies...');
  for (const policy of policies) {
    const result = await deployFile(policy);
    if (result) {
      deploymentResults.policies[result.name] = result;
    }
  }
  
  // Deploy Tools
  console.log('\n🔧 Deploying Vincent Tools...');
  for (const tool of tools) {
    const result = await deployFile(tool);
    if (result) {
      deploymentResults.tools[result.name] = result;
    }
  }
  
  // Save results
  const resultsFile = path.join(__dirname, '../dist/pinata-deployment-results.json');
  fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
  fs.writeFileSync(resultsFile, JSON.stringify(deploymentResults, null, 2));
  
  // Display summary
  console.log('\n📊 Deployment Summary:');
  console.log('='.repeat(60));
  
  Object.entries(deploymentResults.policies).forEach(([name, info]) => {
    console.log(`📋 ${name}:`);
    console.log(`   IPFS CID: ${info.ipfsCid}`);
    console.log(`   URL: ${info.pinataUrl}`);
    console.log('');
  });
  
  Object.entries(deploymentResults.tools).forEach(([name, info]) => {
    console.log(`🔧 ${name}:`);
    console.log(`   IPFS CID: ${info.ipfsCid}`);
    console.log(`   URL: ${info.pinataUrl}`);
    console.log('');
  });
  
  console.log(`💾 Results saved to: ${resultsFile}`);
  console.log('\n🎉 Pinata deployment complete!');
  
  // Generate update commands
  console.log('\n📝 To update your codebase with new CIDs, run:');
  Object.entries(deploymentResults.policies).forEach(([name, info]) => {
    console.log(`sed -i 's/QmCustom${name}123/${info.ipfsCid}/g' src/vincent/BundledVincentTools.js`);
  });
  Object.entries(deploymentResults.tools).forEach(([name, info]) => {
    console.log(`sed -i 's/QmCustom${name}123/${info.ipfsCid}/g' src/vincent/BundledVincentTools.js`);
  });
}

main().catch(console.error);