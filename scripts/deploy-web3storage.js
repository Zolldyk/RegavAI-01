#!/usr/bin/env node

// ============================================================================
// Deploy Vincent Policies to Web3.Storage IPFS
// ============================================================================

import { Web3Storage } from 'web3.storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ Configuration ============
const WEB3_STORAGE_TOKEN = process.env.WEB3_STORAGE_TOKEN;

if (!WEB3_STORAGE_TOKEN) {
  console.error('❌ WEB3_STORAGE_TOKEN environment variable is required');
  console.log('Get your token from: https://web3.storage/tokens/');
  process.exit(1);
}

const client = new Web3Storage({ token: WEB3_STORAGE_TOKEN });

// ============ Helper Functions ============

function makeFileObjects(filePath, name) {
  const content = fs.readFileSync(filePath, 'utf8');
  return [new File([content], `${name}.js`, { type: 'application/javascript' })];
}

async function deployToWeb3Storage(filePath, name, metadata) {
  try {
    console.log(`📦 Deploying ${name} to Web3.Storage...`);
    
    const files = makeFileObjects(filePath, name);
    const cid = await client.put(files, {
      name: metadata.name,
      maxRetries: 3
    });
    
    console.log(`✅ ${name} deployed successfully!`);
    console.log(`   IPFS CID: ${cid}`);
    console.log(`   Gateway URL: https://${cid}.ipfs.w3s.link/${name}.js`);
    
    return {
      name,
      ipfsCid: cid,
      gatewayUrl: `https://${cid}.ipfs.w3s.link/${name}.js`,
      metadata
    };
    
  } catch (error) {
    console.error(`❌ Failed to deploy ${name}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting Web3.Storage IPFS Deployment...\n');
  
  const policies = [
    {
      name: 'TradeAmountLimitPolicy',
      file: path.resolve(__dirname, '../src/vincent/policies/TradeAmountLimitPolicy.js'),
      metadata: { name: 'Trade Amount Limit Policy', type: 'vincent-policy' }
    },
    {
      name: 'TradeExpiryPolicy', 
      file: path.resolve(__dirname, '../src/vincent/policies/TradeExpiryPolicy.js'),
      metadata: { name: 'Trade Expiry Policy', type: 'vincent-policy' }
    },
    {
      name: 'TokenAllowlistPolicy',
      file: path.resolve(__dirname, '../src/vincent/policies/TokenAllowlistPolicy.js'),
      metadata: { name: 'Token Allowlist Policy', type: 'vincent-policy' }
    }
  ];
  
  const tools = [
    {
      name: 'ERC20TradingTool',
      file: path.resolve(__dirname, '../src/vincent/tools/ERC20TradingTool.js'),
      metadata: { name: 'ERC20 Trading Tool', type: 'vincent-tool' }
    }
  ];
  
  const results = { policies: {}, tools: {}, timestamp: new Date().toISOString() };
  
  // Deploy policies
  for (const policy of policies) {
    const result = await deployToWeb3Storage(policy.file, policy.name, policy.metadata);
    if (result) results.policies[result.name] = result;
  }
  
  // Deploy tools
  for (const tool of tools) {
    const result = await deployToWeb3Storage(tool.file, tool.name, tool.metadata);
    if (result) results.tools[result.name] = result;
  }
  
  // Save results
  const resultsFile = path.join(__dirname, '../dist/web3storage-deployment-results.json');
  fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  
  console.log('\n📊 Deployment Complete!');
  console.log('='.repeat(50));
  
  Object.entries(results.policies).forEach(([name, info]) => {
    console.log(`📋 ${name}: ${info.ipfsCid}`);
  });
  
  Object.entries(results.tools).forEach(([name, info]) => {
    console.log(`🔧 ${name}: ${info.ipfsCid}`);
  });
  
  console.log(`\n💾 Results saved to: ${resultsFile}`);
}

main().catch(console.error);