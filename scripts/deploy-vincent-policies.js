#!/usr/bin/env node

// ============================================================================
// Vincent Policies Deployment Script
// ============================================================================

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ Configuration ============
const POLICIES_DIR = path.join(__dirname, '../src/vincent/policies');
const TOOLS_DIR = path.join(__dirname, '../src/vincent/tools');
const DIST_DIR = path.join(__dirname, '../dist/vincent');

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// ============ Policy Deployment Metadata ============
const policies = [
  {
    name: 'TradeAmountLimitPolicy',
    file: 'TradeAmountLimitPolicy.js',
    packageName: '@regav-ai/vincent-policy-trade-amount-limit',
    description: 'Restricts individual trade amounts to prevent overexposure',
    version: '1.0.0'
  },
  {
    name: 'TradeExpiryPolicy', 
    file: 'TradeExpiryPolicy.js',
    packageName: '@regav-ai/vincent-policy-trade-expiry',
    description: 'Ensures trades expire after specified time to avoid stale orders',
    version: '1.0.0'
  },
  {
    name: 'TokenAllowlistPolicy',
    file: 'TokenAllowlistPolicy.js', 
    packageName: '@regav-ai/vincent-policy-token-allowlist',
    description: 'Restricts trading to approved tokens for security',
    version: '1.0.0'
  }
];

const tools = [
  {
    name: 'ERC20TradingTool',
    file: 'ERC20TradingTool.js',
    packageName: '@regav-ai/vincent-tool-erc20-trading',
    description: 'Execute ERC20 token transfers with policy governance',
    version: '1.0.0'
  }
];

// ============ Helper Functions ============

/**
 * Create package.json for a Vincent policy/tool
 */
function createPackageJson(item, type) {
  return {
    name: item.packageName,
    version: item.version,
    description: item.description,
    type: 'module',
    main: 'index.js',
    keywords: ['vincent', type, 'trading', 'governance', 'policy'],
    author: 'Regav-AI Team',
    license: 'MIT',
    dependencies: {
      '@lit-protocol/vincent-tool-sdk': '^1.0.0',
      'zod': '^3.22.0'
    },
    peerDependencies: {
      'ethers': '^6.0.0'
    },
    engines: {
      node: '>=18.0.0'
    },
    repository: {
      type: 'git',
      url: 'https://github.com/regav-ai/vincent-policies.git'
    }
  };
}

/**
 * Create index.js file that exports the policy/tool
 */
function createIndexFile(item, type) {
  const importPath = `./${item.file}`;
  return `// ${item.description}
export { vincentPolicy as default } from '${importPath}';
export * from '${importPath}';
`;
}

/**
 * Create README.md for the package
 */
function createReadme(item, type) {
  return `# ${item.name}

${item.description}

## Installation

\`\`\`bash
npm install ${item.packageName}
\`\`\`

## Usage

\`\`\`javascript
import ${item.name} from '${item.packageName}';

// Use the ${type} in your Vincent application
\`\`\`

## Package Information

- **Package**: ${item.packageName}
- **Version**: ${item.version}
- **Type**: Vincent ${type}
- **Author**: Regav-AI Team

## License

MIT
`;
}

/**
 * Prepare a single policy/tool for deployment
 */
function prepareForDeployment(item, type, sourceDir) {
  const itemDir = path.join(DIST_DIR, item.name);
  
  // Create directory
  if (!fs.existsSync(itemDir)) {
    fs.mkdirSync(itemDir, { recursive: true });
  }
  
  // Copy source file
  const sourceFile = path.join(sourceDir, item.file);
  const destFile = path.join(itemDir, item.file);
  fs.copyFileSync(sourceFile, destFile);
  
  // Create package.json
  const packageJson = createPackageJson(item, type);
  fs.writeFileSync(
    path.join(itemDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create index.js
  const indexContent = createIndexFile(item, type);
  fs.writeFileSync(path.join(itemDir, 'index.js'), indexContent);
  
  // Create README.md
  const readmeContent = createReadme(item, type);
  fs.writeFileSync(path.join(itemDir, 'README.md'), readmeContent);
  
  console.log(`✅ Prepared ${item.name} for deployment in ${itemDir}`);
  return itemDir;
}

/**
 * Add to IPFS and get CID
 */
function addToIPFS(itemDir, itemName) {
  try {
    console.log(`📦 Adding ${itemName} to IPFS...`);
    
    // Add directory to IPFS
    const result = execSync(`ipfs add -r "${itemDir}"`, { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const cid = lastLine.split(' ')[1];
    
    console.log(`🎉 ${itemName} deployed to IPFS with CID: ${cid}`);
    return cid;
    
  } catch (error) {
    console.error(`❌ Failed to add ${itemName} to IPFS:`, error.message);
    
    // Check if IPFS daemon is running
    try {
      execSync('ipfs id', { encoding: 'utf8' });
      console.log('💡 IPFS daemon is running. Check the file path and try again.');
    } catch {
      console.log('💡 IPFS daemon is not running. Start it with: ipfs daemon');
    }
    
    return null;
  }
}

/**
 * Check IPFS availability
 */
function checkIPFS() {
  try {
    execSync('ipfs version', { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

// ============ Main Deployment Process ============

async function main() {
  console.log('🚀 Starting Vincent Policies Deployment...\n');
  
  // Check if IPFS is available
  if (!checkIPFS()) {
    console.error('❌ IPFS not found. Please install IPFS first:');
    console.log('   macOS: brew install ipfs');
    console.log('   Linux: https://docs.ipfs.io/install/');
    console.log('   Then run: ipfs init && ipfs daemon');
    process.exit(1);
  }
  
  const deploymentResults = {
    policies: {},
    tools: {},
    timestamp: new Date().toISOString()
  };
  
  // Deploy Policies
  console.log('📋 Deploying Vincent Policies...');
  for (const policy of policies) {
    const policyDir = prepareForDeployment(policy, 'policy', POLICIES_DIR);
    const cid = addToIPFS(policyDir, policy.name);
    
    if (cid) {
      deploymentResults.policies[policy.name] = {
        packageName: policy.packageName,
        ipfsCid: cid,
        description: policy.description,
        version: policy.version
      };
    }
  }
  
  // Deploy Tools
  console.log('\n🔧 Deploying Vincent Tools...');
  for (const tool of tools) {
    const toolDir = prepareForDeployment(tool, 'tool', TOOLS_DIR);
    const cid = addToIPFS(toolDir, tool.name);
    
    if (cid) {
      deploymentResults.tools[tool.name] = {
        packageName: tool.packageName,
        ipfsCid: cid,
        description: tool.description,
        version: tool.version
      };
    }
  }
  
  // Save deployment results
  const resultsFile = path.join(DIST_DIR, 'deployment-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(deploymentResults, null, 2));
  
  console.log('\n📊 Deployment Summary:');
  console.log('='.repeat(50));
  
  Object.entries(deploymentResults.policies).forEach(([name, info]) => {
    console.log(`📋 ${name}:`);
    console.log(`   Package: ${info.packageName}`);
    console.log(`   IPFS CID: ${info.ipfsCid}`);
    console.log('');
  });
  
  Object.entries(deploymentResults.tools).forEach(([name, info]) => {
    console.log(`🔧 ${name}:`);
    console.log(`   Package: ${info.packageName}`);
    console.log(`   IPFS CID: ${info.ipfsCid}`);
    console.log('');
  });
  
  console.log(`💾 Results saved to: ${resultsFile}`);
  console.log('\n🎉 Deployment complete!');
  
  // Generate update script
  generateUpdateScript(deploymentResults);
}

/**
 * Generate script to update CIDs in codebase
 */
function generateUpdateScript(results) {
  const updateScript = `#!/bin/bash
# Auto-generated script to update IPFS CIDs in codebase

echo "🔄 Updating IPFS CIDs in codebase..."

# Update BundledVincentTools.js
sed -i 's/QmCustomTradeAmountLimit123/${results.policies.TradeAmountLimitPolicy?.ipfsCid || 'QmCustomTradeAmountLimit123'}/g' src/vincent/BundledVincentTools.js
sed -i 's/QmCustomTradeExpiry123/${results.policies.TradeExpiryPolicy?.ipfsCid || 'QmCustomTradeExpiry123'}/g' src/vincent/BundledVincentTools.js
sed -i 's/QmCustomTokenAllowlist123/${results.policies.TokenAllowlistPolicy?.ipfsCid || 'QmCustomTokenAllowlist123'}/g' src/vincent/BundledVincentTools.js
sed -i 's/QmCustomERC20Trading123/${results.tools.ERC20TradingTool?.ipfsCid || 'QmCustomERC20Trading123'}/g' src/vincent/BundledVincentTools.js

# Update VincentClient.js
sed -i 's/QmCustomTradeAmountLimit123/${results.policies.TradeAmountLimitPolicy?.ipfsCid || 'QmCustomTradeAmountLimit123'}/g' src/integrations/VincentClient.js
sed -i 's/QmCustomTradeExpiry123/${results.policies.TradeExpiryPolicy?.ipfsCid || 'QmCustomTradeExpiry123'}/g' src/integrations/VincentClient.js
sed -i 's/QmCustomTokenAllowlist123/${results.policies.TokenAllowlistPolicy?.ipfsCid || 'QmCustomTokenAllowlist123'}/g' src/integrations/VincentClient.js

echo "✅ IPFS CIDs updated successfully!"
`;

  const updateScriptPath = path.join(DIST_DIR, 'update-cids.sh');
  fs.writeFileSync(updateScriptPath, updateScript);
  execSync(`chmod +x "${updateScriptPath}"`);
  
  console.log(`📝 Update script generated: ${updateScriptPath}`);
  console.log('   Run this script to update CIDs in your codebase');
}

// Run the deployment
main().catch(console.error);