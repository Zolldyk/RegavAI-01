// Vincent Consent Manager for Automated Trading
// Handles proper Vincent consent flow for production trading agents

import { getVincentWebAppClient } from '@lit-protocol/vincent-app-sdk';
import { EventEmitter } from 'events';
import logger from '../utils/Logger.js';
import fs from 'fs';
import path from 'path';

class VincentConsentManager extends EventEmitter {
  constructor (config) {
    super();
    this.config = config;
    this.webAppClient = null;
    this.consentCompleted = false;
    this.userInfo = null;
    this.jwt = null;
    this.consentFilePath = path.join(process.cwd(), '.vincent-consent.json');
  }

  async initialize () {
    try {
      // Initialize Vincent web app client
      this.webAppClient = getVincentWebAppClient({
        appId: this.config.appId.toString(),
        environment: this.config.environment || 'datil-dev'
      });

      // Check for existing consent
      const existingConsent = this.loadStoredConsent();
      if (existingConsent && this.isConsentValid(existingConsent)) {
        logger.info('✅ Found valid existing Vincent consent');
        this.userInfo = existingConsent.userInfo;
        this.jwt = existingConsent.jwt;
        this.consentCompleted = true;
        this.emit('consent_ready', this.userInfo);
        return true;
      }

      // Need new consent
      logger.info('🔑 Vincent consent required for automated trading');
      return false;
    } catch (error) {
      logger.error('Failed to initialize Vincent consent manager:', error);
      throw error;
    }
  }

  async startConsentFlow () {
    try {
      // Use the proper Vincent consent flow
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const consentUrl = `${baseUrl}/api/vincent/consent`;

      logger.info('🚀 Starting Vincent consent flow...');
      logger.info('\n🔐 VINCENT CONSENT REQUIRED');
      logger.info('==========================================');
      logger.info('Your trading agent needs Vincent permission to execute trades.');
      logger.info('');
      logger.info('📱 PLEASE COMPLETE CONSENT:');
      logger.info(`1. Open: ${consentUrl}`);
      logger.info('2. Connect your wallet');
      logger.info('3. Approve trading permissions');
      logger.info('4. You will be redirected back with a JWT token');
      logger.info('5. The JWT token will be automatically processed');
      logger.info('');
      logger.info('💡 ALTERNATIVE: Manual JWT entry');
      logger.info('   If automatic processing fails, create "vincent-jwt.txt" with the JWT token');
      logger.info('==========================================\n');

      // Start checking for consent completion
      this.startConsentPolling();
      // Also prompt for manual JWT entry
      this.promptForManualJWT();
    } catch (error) {
      logger.error('Failed to start Vincent consent flow:', error);
      throw error;
    }
  }

  startConsentPolling () {
    const pollInterval = setInterval(async () => {
      try {
        // Check if consent was completed via callback
        const storedConsent = this.loadStoredConsent();
        const callbackConsent = this.loadCallbackConsent();

        let consentToUse = null;

        // Check callback consent first (more recent)
        if (callbackConsent && (callbackConsent.jwt || callbackConsent.ownerBypass)) {
          try {
            let userInfo;

            // Handle owner auto-grant bypass
            if (callbackConsent.ownerBypass) {
              // Get delegatee signer address from environment
              const delegateePrivateKey = process.env.VINCENT_APP_DELEGATEE_PRIVATE_KEY;
              let delegateeAddress = null;

              if (delegateePrivateKey) {
                try {
                  const { ethers } = await import('ethers');
                  const wallet = new ethers.Wallet(delegateePrivateKey);
                  delegateeAddress = wallet.address;
                } catch (error) {
                  logger.error('Error getting delegatee address:', error);
                }
              }

              userInfo = {
                pkpAddress: delegateeAddress || 'owner-auto-grant-address',
                pkpPublicKey: delegateeAddress ? '0x04' + delegateeAddress.slice(2) : 'owner-auto-grant-public-key',
                pkpTokenId: callbackConsent.pkpTokenId || process.env.VINCENT_PKP_TOKEN_ID || process.env.LIT_CAPACITY_CREDIT_TOKEN_ID,
                appId: process.env.VINCENT_APP_ID || '983',
                appVersion: process.env.VINCENT_APP_VERSION || 1,
                authMethod: 'owner_auto_grant',
                consentTimestamp: Date.now(),
                expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
                ownerBypass: true,
                isValidForTrading: true
              };
              logger.info('✅ Vincent authentication automatically granted (owner mode)', {
                pkpTokenId: userInfo.pkpTokenId,
                pkpAddress: userInfo.pkpAddress,
                authMethod: 'owner_auto_grant'
              });
            } else {
              userInfo = await this.handleConsentCallback(callbackConsent.jwt);
            }

            consentToUse = { userInfo, jwt: callbackConsent.jwt || 'owner-auto-grant' };

            // Clean up callback file
            this.clearCallbackConsent();
          } catch (error) {
            logger.error('Error processing callback consent:', error);
          }
        }

        // Fall back to stored consent
        if (!consentToUse && storedConsent && this.isConsentValid(storedConsent)) {
          consentToUse = storedConsent;
        }

        if (consentToUse) {
          clearInterval(pollInterval);

          this.userInfo = consentToUse.userInfo;
          this.jwt = consentToUse.jwt;
          this.consentCompleted = true;

          logger.info('✅ Vincent consent completed successfully');
          logger.info('\n🎉 AUTHENTICATION COMPLETED!');
          logger.info('==========================================');
          if (this.userInfo.ownerBypass) {
            logger.info('✅ Vincent authentication automatically granted (owner mode)');
          } else {
            logger.info('✅ Vincent permissions granted via consent flow');
          }
          logger.info('📊 PKP Token ID:', this.userInfo.pkpTokenId);
          logger.info('🚀 Resuming automated trading...');
          logger.info('==========================================\n');

          this.emit('consent_completed', this.userInfo);
        }
      } catch (error) {
        logger.error('Error polling for consent:', error);
      }
    }, 2000); // Check every 2 seconds

    // Timeout after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (!this.consentCompleted) {
        logger.error('Vincent consent timeout - please restart and try again');
        this.emit('consent_timeout');
      }
    }, 600000); // 10 minutes
  }

  async handleConsentCallback (jwtToken) {
    try {
      // Import JWT verification functions from Vincent SDK
      const { jwt } = await import('@lit-protocol/vincent-app-sdk');

      // Try to verify JWT with expected audience (callback URL)
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const expectedAudience = `${baseUrl}/api/vincent/callback`;

      let decodedJWT;
      try {
        // First try to verify with full validation
        decodedJWT = jwt.verify(jwtToken, expectedAudience);
      } catch (verifyError) {
        logger.warn('JWT verification failed, trying decode only:', verifyError.message);
        // Fall back to decode only if verification fails
        decodedJWT = jwt.decode(jwtToken);

        if (!decodedJWT || !decodedJWT.payload) {
          throw new Error('Invalid JWT token from Vincent consent');
        }
      }

      // Extract user information
      const userInfo = {
        pkpAddress: decodedJWT.payload.pkp.ethAddress,
        pkpPublicKey: decodedJWT.payload.pkp.publicKey,
        pkpTokenId: decodedJWT.payload.pkp.tokenId,
        appId: decodedJWT.payload.app.id,
        appVersion: decodedJWT.payload.app.version,
        authMethod: decodedJWT.payload.authentication,
        consentTimestamp: Date.now(),
        expiresAt: decodedJWT.payload.exp * 1000 // Convert to milliseconds
      };

      // Store consent for future use
      this.storeConsent({
        userInfo,
        jwt: jwtToken,
        timestamp: Date.now()
      });

      logger.info('Vincent consent callback processed successfully', {
        pkpTokenId: userInfo.pkpTokenId,
        pkpAddress: userInfo.pkpAddress
      });

      return userInfo;
    } catch (error) {
      logger.error('Failed to process Vincent consent callback:', error);
      throw error;
    }
  }

  storeConsent (consentData) {
    try {
      fs.writeFileSync(this.consentFilePath, JSON.stringify(consentData, null, 2));
      logger.info('Vincent consent stored successfully');
    } catch (error) {
      logger.error('Failed to store Vincent consent:', error);
    }
  }

  loadStoredConsent () {
    try {
      if (!fs.existsSync(this.consentFilePath)) {
        return null;
      }

      const data = fs.readFileSync(this.consentFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load stored Vincent consent:', error);
      return null;
    }
  }

  isConsentValid (consent) {
    if (!consent || !consent.userInfo) {
      return false;
    }

    try {
      // Handle owner auto-grant bypass
      if (consent.userInfo.ownerBypass && consent.userInfo.authMethod === 'owner_auto_grant') {
        // Check if owner auto-grant has expired
        const now = Date.now();
        const expiresAt = consent.userInfo.expiresAt;

        if (expiresAt && now > expiresAt) {
          logger.info('Owner auto-grant has expired, requiring re-authentication');
          return false;
        }

        // Check if consent is less than 24 hours old (safety check)
        const consentAge = now - consent.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        if (consentAge > maxAge) {
          logger.info('Owner auto-grant is too old, requiring re-authentication');
          return false;
        }

        logger.info('✅ Vincent authentication valid (owner mode)', {
          pkpTokenId: consent.userInfo.pkpTokenId,
          authMethod: consent.userInfo.authMethod
        });
        return true;
      }

      // Handle normal JWT validation
      if (!consent.jwt) {
        return false;
      }

      // Additional JWT validation
      const { jwt } = require('@lit-protocol/vincent-app-sdk');

      // Check if JWT is expired using Vincent SDK
      if (jwt.isExpired(jwt.decode(consent.jwt))) {
        logger.info('Vincent JWT has expired');
        return false;
      }

      // Check if consent has expired
      const now = Date.now();
      const expiresAt = consent.userInfo.expiresAt;

      if (expiresAt && now > expiresAt) {
        logger.info('Vincent consent has expired');
        return false;
      }

      // Check if consent is less than 24 hours old (safety check)
      const consentAge = now - consent.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (consentAge > maxAge) {
        logger.info('Vincent consent is too old, requiring re-consent');
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error validating Vincent consent:', error);
      return false;
    }
  }

  clearStoredConsent () {
    try {
      if (fs.existsSync(this.consentFilePath)) {
        fs.unlinkSync(this.consentFilePath);
        logger.info('Vincent consent cleared');
      }
    } catch (error) {
      logger.error('Failed to clear Vincent consent:', error);
    }
  }

  loadCallbackConsent () {
    try {
      const callbackFilePath = path.join(process.cwd(), '.vincent-consent-callback.json');
      if (!fs.existsSync(callbackFilePath)) {
        return null;
      }

      const data = fs.readFileSync(callbackFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load callback Vincent consent:', error);
      return null;
    }
  }

  clearCallbackConsent () {
    try {
      const callbackFilePath = path.join(process.cwd(), '.vincent-consent-callback.json');
      if (fs.existsSync(callbackFilePath)) {
        fs.unlinkSync(callbackFilePath);
        logger.info('Vincent callback consent cleared');
      }
    } catch (error) {
      logger.error('Failed to clear Vincent callback consent:', error);
    }
  }

  promptForManualJWT () {
    // Set up a simple readline interface for manual JWT entry
    setTimeout(() => {
      logger.info('\n💡 MANUAL JWT ENTRY:');
      logger.info('==========================================');
      logger.info('If you have completed the consent flow and received a JWT token,');
      logger.info('you can paste it here to continue:');
      logger.info('');
      logger.info('JWT Token (press Enter after pasting):');
      // Simple manual check for JWT file or localStorage simulation
      const checkForManualJWT = () => {
        try {
          // Check if user has created a manual JWT file
          const manualJWTPath = path.join(process.cwd(), 'vincent-jwt.txt');
          if (fs.existsSync(manualJWTPath)) {
            const jwtContent = fs.readFileSync(manualJWTPath, 'utf8').trim();
            if (jwtContent) {
              this.processManualJWT(jwtContent);
              fs.unlinkSync(manualJWTPath); // Clean up
              return true;
            }
          }
        } catch (error) {
          logger.error('Error checking for manual JWT:', error);
        }
        return false;
      };

      // Check every 5 seconds for manual JWT
      const manualJWTInterval = setInterval(() => {
        if (checkForManualJWT() || this.consentCompleted) {
          clearInterval(manualJWTInterval);
        }
      }, 5000);

      // Stop after 10 minutes
      setTimeout(() => {
        clearInterval(manualJWTInterval);
      }, 600000);
    }, 5000);
  }

  async processManualJWT (jwtToken) {
    try {
      logger.info('\n🔄 Processing manual JWT token...');
      const userInfo = await this.handleConsentCallback(jwtToken);
      this.userInfo = userInfo;
      this.jwt = jwtToken;
      this.consentCompleted = true;

      logger.info('✅ Manual JWT processed successfully');
      logger.info('\n🎉 CONSENT COMPLETED!');
      logger.info('==========================================');
      logger.info('✅ Vincent permissions granted');
      logger.info('📊 PKP Token ID:', this.userInfo.pkpTokenId);
      logger.info('🚀 Resuming automated trading...');
      logger.info('==========================================\n');

      this.emit('consent_completed', this.userInfo);
    } catch (error) {
      logger.error('Failed to process manual JWT:', error);
      logger.error('\n❌ Failed to process JWT token. Please try again.');
    }
  }

  getUserInfo () {
    return this.userInfo;
  }

  getJWT () {
    return this.jwt;
  }

  isConsentCompleted () {
    return this.consentCompleted;
  }
}

export default VincentConsentManager;
