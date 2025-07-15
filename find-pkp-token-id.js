#!/usr/bin/env node

// Quick utility to find your PKP token ID
import { getVincentWebAppClient } from '@lit-protocol/vincent-app-sdk';

async function findPkpTokenId() {
  try {
    console.log('🔍 Attempting to discover PKP token ID...');
    
    // Try to get Vincent web app client
    const webAppClient = getVincentWebAppClient({
      appId: '983', // Your app ID
      environment: 'staging'
    });
    
    console.log('✅ Vincent web app client created');
    console.log('📝 Please visit this URL to complete consent flow:');
    console.log(`https://vincent.domains/consent?appId=983&redirectUrl=${encodeURIComponent('http://localhost:3000/callback')}`);
    console.log('\n🔍 After completing consent, check browser localStorage for:');
    console.log('- vincent_pkp_token_id');
    console.log('- vincent_user_info'); 
    console.log('- lit_*');
    console.log('\n💡 The PKP token ID should be a number like 12345, 67890, etc.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Alternative approach:');
    console.log('1. Check your Vincent app configuration');
    console.log('2. Contact Vincent support with your app ID: 983');
    console.log('3. Check Vercel deployment logs for PKP references');
  }
}

findPkpTokenId();