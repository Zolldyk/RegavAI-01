#!/usr/bin/env node

// Alternative methods to get PKP Token ID without Vincent consent URLs
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { getVincentToolClient } from '@lit-protocol/vincent-app-sdk';

console.log('🔍 Alternative PKP Token ID Retrieval Methods');
console.log('='.repeat(50));

// Method 1: Check if Vincent SDK can provide token info
async function checkVincentSDK() {
  try {
    console.log('\n📦 Method 1: Checking Vincent SDK for token info...');
    
    // Try to get tool client
    const toolClient = getVincentToolClient({
      appId: '983',
      environment: 'datil-dev'
    });
    
    console.log('✅ Vincent tool client created');
    
    // Check if there's any stored authentication
    const authInfo = await toolClient.getAuthInfo?.() || null;
    console.log('🔐 Auth info:', authInfo);
    
    return null;
  } catch (error) {
    console.log('❌ Vincent SDK method failed:', error.message);
    return null;
  }
}

// Method 2: Use Lit Protocol directly
async function checkLitProtocol() {
  try {
    console.log('\n🔥 Method 2: Checking Lit Protocol directly...');
    
    const litNodeClient = new LitNodeClient({
      litNetwork: 'datil-dev',
      debug: false
    });
    
    await litNodeClient.connect();
    console.log('✅ Connected to Lit Protocol');
    
    // This would require existing PKP info, so it's more for verification
    console.log('💡 Note: This method requires existing PKP information');
    
    await litNodeClient.disconnect();
    return null;
  } catch (error) {
    console.log('❌ Lit Protocol method failed:', error.message);
    return null;
  }
}

// Method 3: Check environment and provide guidance
function checkEnvironmentAndGuide() {
  console.log('\n🎯 Method 3: Environment Check and Guidance');
  
  const currentTokenId = process.env.VINCENT_PKP_TOKEN_ID;
  console.log('Current PKP Token ID:', currentTokenId);
  
  if (!currentTokenId || currentTokenId === '123456') {
    console.log('\n❌ No valid PKP Token ID found in environment');
    console.log('\n🔧 Alternative Solutions:');
    console.log('1. Contact Vincent support directly for PKP token ID');
    console.log('2. Check Vincent documentation for token retrieval');
    console.log('3. Use a development/testing approach temporarily');
    console.log('4. Check if you have any existing Vincent app configurations');
    
    return null;
  }
  
  console.log('✅ PKP Token ID found in environment');
  return currentTokenId;
}

// Method 4: Generate development token ID (for testing only)
function generateDevTokenId() {
  console.log('\n🧪 Method 4: Development Token ID Generation');
  console.log('⚠️  WARNING: This is for development/testing only!');
  
  // Generate a realistic-looking token ID for development
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  const devTokenId = `${timestamp}${random}`;
  
  console.log('Generated development token ID:', devTokenId);
  console.log('\n📝 To use this temporarily:');
  console.log(`1. Update your .env file: VINCENT_PKP_TOKEN_ID=${devTokenId}`);
  console.log('2. This will allow development testing');
  console.log('3. Replace with real PKP token ID before production');
  
  return devTokenId;
}

// Method 5: Check for existing Vincent configurations
async function checkExistingConfigurations() {
  console.log('\n📂 Method 5: Checking existing Vincent configurations...');
  
  // Check common locations for Vincent configs
  const locations = [
    process.env.HOME + '/.vincent',
    process.env.HOME + '/.lit',
    process.cwd() + '/.vincent',
    process.cwd() + '/vincent-config.json'
  ];
  
  let found = false;
  
  try {
    const fs = await import('fs');
    
    for (const location of locations) {
      if (fs.existsSync(location)) {
        console.log('✅ Found Vincent config at:', location);
        found = true;
        
        if (location.endsWith('.json')) {
          const config = JSON.parse(fs.readFileSync(location, 'utf8'));
          console.log('Config contents:', config);
          
          if (config.pkpTokenId) {
            console.log('🎉 PKP Token ID found in config:', config.pkpTokenId);
            return config.pkpTokenId;
          }
        }
      }
    }
    
    if (!found) {
      console.log('❌ No existing Vincent configurations found');
    }
  } catch (error) {
    console.log('❌ Error checking configurations:', error.message);
  }
  
  return null;
}

// Main execution
async function main() {
  console.log('🚀 Starting alternative PKP token ID retrieval...\n');
  
  // Try all methods
  const methods = [
    checkVincentSDK,
    checkLitProtocol,
    checkEnvironmentAndGuide,
    checkExistingConfigurations
  ];
  
  for (const method of methods) {
    try {
      const result = await method();
      if (result) {
        console.log(`\n🎉 SUCCESS! PKP Token ID found: ${result}`);
        console.log('\n📝 Next steps:');
        console.log(`1. Update your .env file: VINCENT_PKP_TOKEN_ID=${result}`);
        console.log('2. Restart your trading agent');
        console.log('3. Test the agent with the new token ID');
        return;
      }
    } catch (error) {
      console.log(`❌ Method failed: ${error.message}`);
    }
  }
  
  console.log('\n❌ No PKP Token ID found through automatic methods');
  console.log('\n🔄 Trying development token generation...');
  
  const devTokenId = generateDevTokenId();
  
  console.log('\n📞 Contact Options:');
  console.log('1. Vincent Support: Check their documentation or support channels');
  console.log('2. Lit Protocol Discord: https://discord.gg/lit-protocol');
  console.log('3. Vincent GitHub: Look for examples or issue reports');
  
  console.log('\n⚡ Quick Test with Development Token:');
  console.log('If you want to test your trading agent immediately:');
  console.log(`export VINCENT_PKP_TOKEN_ID=${devTokenId}`);
  console.log('npm start');
  console.log('(Remember to replace with real token ID later!)');
}

main().catch(console.error);