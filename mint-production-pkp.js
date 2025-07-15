#!/usr/bin/env node

// Production PKP Token ID Minting Script
// This creates a legitimate PKP token ID that works in production

import { LitContracts } from '@lit-protocol/contracts-sdk';
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔐 Production PKP Token ID Minting');
console.log('=' .repeat(50));

async function mintProductionPKP() {
  let litNodeClient;
  let litContracts;
  
  try {
    // Step 1: Initialize Lit Node Client
    console.log('🔌 Connecting to Lit Protocol Network...');
    litNodeClient = new LitNodeClient({
      litNetwork: 'datil-dev', // Use 'datil-dev' for development, 'mainnet' for production
      debug: false
    });
    
    await litNodeClient.connect();
    console.log('✅ Connected to Lit Protocol Network');
    
    // Step 2: Initialize wallet for minting fees
    console.log('💰 Setting up wallet for minting fees...');
    const privateKey = process.env.VINCENT_APP_DELEGATEE_PRIVATE_KEY;
    
    if (!privateKey) {
      throw new Error('VINCENT_APP_DELEGATEE_PRIVATE_KEY not found in environment');
    }
    
    // Create provider for Lit Protocol's network
    const provider = new ethers.providers.JsonRpcProvider('https://lit-protocol.calderachain.xyz/replica-0');
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log('✅ Wallet initialized:', wallet.address);
    
    // Step 3: Initialize Lit Contracts
    console.log('📄 Initializing Lit Contracts...');
    litContracts = new LitContracts({
      signer: wallet,
      network: 'datil-dev', // Use 'datil-dev' for development, 'mainnet' for production
      debug: false
    });
    
    await litContracts.connect();
    console.log('✅ Lit Contracts connected');
    
    // Step 4: Mint PKP
    console.log('🪙 Minting PKP...');
    console.log('⏳ This may take a few minutes...');
    
    const mintInfo = await litContracts.pkpNftContract.write.mint(
      wallet.address // The PKP will be owned by this address
    );
    
    console.log('✅ PKP minted successfully!');
    console.log('📊 Mint transaction:', mintInfo.transactionHash);
    
    // Step 5: Get token ID from transaction
    console.log('🔍 Extracting token ID from transaction...');
    
    // Get the transaction receipt
    const receipt = await wallet.provider.getTransactionReceipt(mintInfo.transactionHash);
    
    // Parse the events to find the token ID
    const transferEvent = receipt.logs.find(log => 
      log.topics[0] === ethers.utils.id('Transfer(address,address,uint256)')
    );
    
    if (!transferEvent) {
      throw new Error('Could not find Transfer event in transaction receipt');
    }
    
    const tokenId = ethers.BigNumber.from(transferEvent.topics[3]).toString();
    
    console.log('🎉 PKP Token ID:', tokenId);
    console.log('🔑 PKP Public Key:', mintInfo.pkp.publicKey);
    console.log('🏠 PKP ETH Address:', mintInfo.pkp.ethAddress);
    
    // Step 6: Verify PKP exists
    console.log('✅ Verifying PKP exists...');
    const pkpInfo = await litContracts.pkpNftContract.read.tokenURI(tokenId);
    console.log('📝 PKP verified on chain');
    
    // Step 7: Update instructions
    console.log('\n🎯 SUCCESS! Your production PKP token ID is ready:');
    console.log('=' .repeat(50));
    console.log(`PKP Token ID: ${tokenId}`);
    console.log(`PKP Public Key: ${mintInfo.pkp.publicKey}`);
    console.log(`PKP ETH Address: ${mintInfo.pkp.ethAddress}`);
    console.log(`Owner Address: ${wallet.address}`);
    console.log(`Network: datil-dev`);
    console.log(`Transaction: ${mintInfo.transactionHash}`);
    
    console.log('\n📝 Next Steps:');
    console.log('1. Update your .env file:');
    console.log(`   VINCENT_PKP_TOKEN_ID=${tokenId}`);
    console.log('2. Save the PKP information securely');
    console.log('3. Test your trading agent with the new PKP token ID');
    console.log('4. For mainnet production, change network to "mainnet"');
    
    return {
      tokenId,
      publicKey: mintInfo.pkp.publicKey,
      ethAddress: mintInfo.pkp.ethAddress,
      transactionHash: mintInfo.transactionHash
    };
    
  } catch (error) {
    console.error('❌ Error minting PKP:', error);
    
    if (error.message.includes('insufficient funds')) {
      console.log('\n💡 Solution: You need test tokens to mint PKP');
      console.log('1. Get test tokens from: https://faucet.litprotocol.com');
      console.log('2. Send test tokens to:', wallet?.address);
      console.log('3. Try again');
    } else if (error.message.includes('network')) {
      console.log('\n💡 Solution: Network connectivity issue');
      console.log('1. Check your internet connection');
      console.log('2. Try again in a few minutes');
      console.log('3. Check Lit Protocol status');
    } else {
      console.log('\n💡 Troubleshooting:');
      console.log('1. Ensure VINCENT_APP_DELEGATEE_PRIVATE_KEY is set');
      console.log('2. Check if you have sufficient test tokens');
      console.log('3. Verify network connectivity');
    }
    
    return null;
  } finally {
    // Clean up connections
    if (litNodeClient) {
      await litNodeClient.disconnect();
    }
  }
}

// Alternative: Use PKP Helper for easier minting
async function mintWithPKPHelper() {
  try {
    console.log('\n🔄 Alternative: Using PKP Helper method...');
    
    // Import PKP Helper
    const { PKPEthersWallet } = await import('@lit-protocol/pkp-ethers');
    
    // This method requires authentication (Google OAuth, etc.)
    console.log('💡 PKP Helper requires authentication method');
    console.log('   - Google OAuth');
    console.log('   - Email/SMS OTP');
    console.log('   - Discord (coming soon)');
    
    return null;
  } catch (error) {
    console.log('❌ PKP Helper method not available:', error.message);
    return null;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting production PKP minting process...\n');
  
  const pkpInfo = await mintProductionPKP();
  
  if (!pkpInfo) {
    console.log('\n🔄 Trying alternative method...');
    await mintWithPKPHelper();
  }
  
  console.log('\n📚 Additional Resources:');
  console.log('- Lit Protocol Docs: https://developer.litprotocol.com/');
  console.log('- PKP Explorer: https://explorer.litprotocol.com/');
  console.log('- Test Faucet: https://faucet.litprotocol.com/');
  console.log('- Vincent Documentation: https://developer.litprotocol.com/vincent-announcement');
}

main().catch(console.error);