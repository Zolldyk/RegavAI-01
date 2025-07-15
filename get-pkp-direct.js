#!/usr/bin/env node

// Direct PKP Token ID retrieval using Vincent SDK
import { getVincentWebAppClient } from '@lit-protocol/vincent-app-sdk';

async function getPkpTokenDirect() {
  try {
    console.log('🔍 Attempting to get PKP token ID directly from Vincent SDK...');
    
    // Initialize Vincent web app client
    const webAppClient = getVincentWebAppClient({
      appId: '983',
      environment: 'datil-dev' // or 'production'
    });
    
    console.log('✅ Vincent web app client initialized');
    
    // Check if we have any stored authentication
    const hasAuth = webAppClient.isAuthenticated();
    console.log('🔐 Authentication status:', hasAuth);
    
    if (!hasAuth) {
      console.log('\n❌ No authentication found. You need to complete the consent flow first.');
      console.log('\n📝 Manual steps to get PKP Token ID:');
      console.log('1. Visit: https://vincent.domains/consent?appId=983');
      console.log('2. Connect your wallet and approve permissions');
      console.log('3. Complete the authorization flow');
      console.log('4. Check the redirect URL for JWT token');
      console.log('5. Decode the JWT to extract PKP token ID');
      
      console.log('\n🔧 Alternative: Check your Vincent app dashboard');
      console.log('- Log into your Vincent developer account');
      console.log('- Look for PKP token IDs associated with your app');
      console.log('- Use the token ID from your app configuration');
      
      return null;
    }
    
    // Try to get current user info
    const userInfo = await webAppClient.getCurrentUserInfo();
    console.log('👤 Current user info:', userInfo);
    
    if (userInfo && userInfo.pkpTokenId) {
      console.log('\n🎉 PKP Token ID found:', userInfo.pkpTokenId);
      console.log('\n📝 Update your .env file with:');
      console.log(`VINCENT_PKP_TOKEN_ID=${userInfo.pkpTokenId}`);
      return userInfo.pkpTokenId;
    }
    
    console.log('\n❌ PKP Token ID not found in user info');
    return null;
    
  } catch (error) {
    console.error('❌ Error getting PKP token ID:', error.message);
    
    console.log('\n💡 Troubleshooting tips:');
    console.log('1. Make sure you have completed Vincent consent flow');
    console.log('2. Check if Vincent services are accessible');
    console.log('3. Verify your app ID (983) is correct');
    console.log('4. Try using a different environment (staging vs production)');
    
    return null;
  }
}

// Alternative: Extract from JWT if provided as argument
function extractFromJWT(jwtToken) {
  try {
    const payload = JSON.parse(atob(jwtToken.split('.')[1]));
    if (payload.pkp && payload.pkp.tokenId) {
      console.log('🎉 PKP Token ID extracted from JWT:', payload.pkp.tokenId);
      return payload.pkp.tokenId;
    }
    console.log('❌ PKP Token ID not found in JWT payload');
    return null;
  } catch (error) {
    console.error('❌ Error extracting PKP token ID from JWT:', error.message);
    return null;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0].startsWith('eyJ')) {
    // JWT token provided as argument
    console.log('🔍 Extracting PKP Token ID from provided JWT...');
    const tokenId = extractFromJWT(args[0]);
    if (tokenId) {
      console.log(`\n📝 Add this to your .env file:\nVINCENT_PKP_TOKEN_ID=${tokenId}`);
    }
  } else {
    // Try direct SDK method
    await getPkpTokenDirect();
  }
}

main().catch(console.error);