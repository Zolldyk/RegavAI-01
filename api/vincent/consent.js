// Vincent Consent Page Handler - Production Version
export default async function handler (req, res) {
  // Enable CORS for Vincent domains
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { method } = req;

    if (method === 'GET') {
      // Return simple, working consent page
      const appId = process.env.VINCENT_APP_ID || '983';
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const redirectUrl = `${baseUrl}/api/vincent/callback`;

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Vincent Consent - Regav Trading Agent</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0; 
                padding: 20px; 
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container { 
                max-width: 600px; 
                background: white; 
                padding: 40px; 
                border-radius: 16px; 
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                text-align: center;
              }
              .title { 
                color: #333; 
                font-size: 32px; 
                margin-bottom: 10px;
                font-weight: 600;
              }
              .subtitle { 
                color: #666; 
                font-size: 18px; 
                margin-bottom: 30px; 
              }
              .permissions { 
                text-align: left; 
                margin: 30px 0; 
                background: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
              }
              .permissions h3 { 
                color: #333; 
                margin-bottom: 15px; 
                font-size: 18px;
              }
              .permissions ul { 
                color: #555; 
                line-height: 1.6;
              }
              .permissions li { 
                margin: 10px 0; 
              }
              .button { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; 
                padding: 16px 32px; 
                border: none; 
                border-radius: 8px; 
                font-size: 18px; 
                font-weight: 600;
                cursor: pointer; 
                margin: 15px 10px;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
              }
              .button:hover { 
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
              }
              .button:active {
                transform: translateY(0);
              }
              .button.secondary {
                background: #6c757d;
                box-shadow: 0 4px 15px rgba(108, 117, 125, 0.4);
              }
              .button.secondary:hover {
                box-shadow: 0 6px 20px rgba(108, 117, 125, 0.6);
              }
              .status { 
                margin: 20px 0; 
                padding: 15px; 
                border-radius: 8px;
                font-weight: 500;
              }
              .loading { 
                background: #e3f2fd; 
                color: #1976d2; 
                border: 1px solid #bbdefb;
              }
              .success { 
                background: #e8f5e8; 
                color: #2e7d32; 
                border: 1px solid #c8e6c9;
              }
              .error { 
                background: #ffebee; 
                color: #c62828; 
                border: 1px solid #ffcdd2;
              }
              .info { 
                color: #666; 
                font-size: 14px; 
                margin-top: 20px;
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              .spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #667eea;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 10px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="title">🔐 Vincent Consent Required</div>
              <div class="subtitle">Authorize Regav Trading Agent</div>
              
              <div class="permissions">
                <h3>📋 Permissions Requested:</h3>
                <ul>
                  <li>✅ Execute trades within spending limits</li>
                  <li>✅ Monitor portfolio performance</li>
                  <li>✅ Access market data and analysis</li>
                  <li>✅ Manage trading positions</li>
                </ul>
                
                <h3>🛡️ Safety Policies:</h3>
                <ul>
                  <li>💰 Maximum trade amount: $${process.env.VINCENT_MAX_TRADE_AMOUNT || 1000}</li>
                  <li>⏰ Trade expiry: ${process.env.VINCENT_TRADE_EXPIRY_MINUTES || 10} minutes</li>
                  <li>🔒 Only approved tokens: BTC, ETH, SOL, XRP, USDT, USDC</li>
                </ul>
              </div>
              
              <button id="consentButton" class="button">
                🚀 Grant Permission
              </button>
              
              <button id="ownerButton" class="button secondary">
                👑 Owner Bypass
              </button>
              
              <div id="status" class="status" style="display: none;"></div>
              
              <div class="info">
                <strong>App ID:</strong> ${appId}<br>
                <strong>Redirect URL:</strong> ${redirectUrl}<br>
                <strong>Environment:</strong> Production
              </div>
            </div>
            
            <script>
              // Production Vincent Consent - Updated ${new Date().toISOString()}
              const appId = '${appId}';
              const redirectUrl = '${redirectUrl}';
              const statusDiv = document.getElementById('status');
              const consentButton = document.getElementById('consentButton');
              const ownerButton = document.getElementById('ownerButton');
              
              function showStatus(message, type = 'loading') {
                if (statusDiv) {
                  statusDiv.innerHTML = message;
                  statusDiv.className = 'status ' + type;
                  statusDiv.style.display = 'block';
                }
                console.log('Status:', message);
              }
              
              // Main consent button - simplified approach
              consentButton.addEventListener('click', async function() {
                console.log('Grant Permission button clicked');
                showStatus('<span class="spinner"></span>Starting Vincent consent...', 'loading');
                
                try {
                  // Primary approach: Vincent SDK for official authentication flow
                  try {
                    console.log('Loading Vincent SDK...');
                    showStatus('<span class="spinner"></span>Connecting to Vincent...', 'loading');
                    
                    // Load Vincent SDK
                    const timestamp = Date.now();
                    const { getVincentWebAppClient } = await import(\`https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js?t=\${timestamp}\`);
                    
                    // Create Vincent client
                    const vincentAppClient = getVincentWebAppClient({ 
                      appId: appId,
                      environment: 'datil-dev' // or 'prod' if you want production
                    });
                    
                    console.log('Vincent SDK loaded successfully');
                    showStatus('<span class="spinner"></span>Opening Vincent authentication...', 'loading');
                    
                    // Try Vincent SDK redirect methods
                    let redirected = false;
                    
                    if (vincentAppClient.redirectToLoginPage) {
                      console.log('Using Vincent redirectToLoginPage');
                      vincentAppClient.redirectToLoginPage({ redirectUri: window.location.href });
                      redirected = true;
                    } else if (vincentAppClient.redirectToConsentPage) {
                      console.log('Using Vincent redirectToConsentPage');
                      vincentAppClient.redirectToConsentPage({ redirectUri: window.location.href });
                      redirected = true;
                    } else if (vincentAppClient.login) {
                      console.log('Using Vincent login');
                      vincentAppClient.login({ redirectUri: window.location.href });
                      redirected = true;
                    }
                    
                    if (redirected) {
                      showStatus('✅ Redirecting to Vincent authentication...', 'success');
                      // Give it a moment to redirect
                      setTimeout(() => {
                        showStatus('If you are not redirected, please check if popups are blocked.', 'loading');
                      }, 3000);
                    } else {
                      throw new Error('No Vincent SDK redirect method available');
                    }
                    
                  } catch (sdkError) {
                    console.log('Vincent SDK failed, trying direct URL fallback:', sdkError);
                    
                    // Fallback to direct URLs
                    const vincentUrls = [
                      \`https://dashboard.heyvincent.ai/\${appId}/consent?redirectUri=\${encodeURIComponent(window.location.href)}\`,
                      \`https://app.vincent.domains/consent?appId=\${appId}&redirectUrl=\${encodeURIComponent(redirectUrl)}\`,
                      \`https://vincent.domains/consent?appId=\${appId}&redirectUrl=\${encodeURIComponent(redirectUrl)}\`
                    ];
                    
                    console.log('Opening Vincent consent URLs:', vincentUrls);
                    
                    // Open primary Vincent URL
                    const consentWindow = window.open(vincentUrls[0], '_blank', 'width=600,height=700,scrollbars=yes,resizable=yes');
                    
                    if (consentWindow) {
                      showStatus('✅ Vincent consent page opened. Complete authentication there and return here.', 'success');
                    } else {
                      throw new Error('Popup blocked');
                    }
                  }
                  
                } catch (error) {
                  console.error('Error starting Vincent consent:', error);
                  showStatus('❌ Failed to open Vincent consent. Try clicking the links below manually.', 'error');
                  
                  // Show manual links
                  setTimeout(() => {
                    statusDiv.innerHTML += \`
                      <div style="margin-top: 15px;">
                        <strong>Manual Options:</strong><br>
                        <a href="https://dashboard.heyvincent.ai/\${appId}/consent?redirectUri=\${encodeURIComponent(window.location.href)}" target="_blank" style="color: #667eea;">🔗 Vincent Dashboard</a><br>
                        <a href="https://app.vincent.domains/consent?appId=\${appId}&redirectUrl=\${encodeURIComponent(redirectUrl)}" target="_blank" style="color: #667eea;">🔗 Vincent App</a>
                      </div>
                    \`;
                  }, 1000);
                }
              });
              
              // Owner bypass button
              ownerButton.addEventListener('click', function() {
                console.log('Owner bypass button clicked');
                
                const confirmOwner = confirm('⚠️ Are you the owner of this trading agent?\\n\\nThis will bypass Vincent consent and auto-grant permissions.');
                
                if (confirmOwner) {
                  showStatus('<span class="spinner"></span>Auto-granting owner permissions...', 'loading');
                  
                  const ownerJWT = {
                    jwt: 'owner-auto-grant-' + Date.now(),
                    timestamp: Date.now(),
                    source: 'owner_auto_grant',
                    ownerBypass: true,
                    pkpTokenId: '${process.env.VINCENT_PKP_TOKEN_ID || 'auto-grant-pkp-token'}'
                  };
                  
                  fetch(redirectUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(ownerJWT)
                  }).then(response => {
                    if (response.ok) {
                      showStatus('✅ Owner permissions auto-granted! You can close this window and check your trading agent.', 'success');
                    } else {
                      showStatus('❌ Failed to auto-grant permissions. Please try the Grant Permission button instead.', 'error');
                    }
                  }).catch(err => {
                    console.error('Auto-grant error:', err);
                    showStatus('❌ Auto-grant failed. Please try the Grant Permission button instead.', 'error');
                  });
                } else {
                  showStatus('Please use the Grant Permission button to complete Vincent consent.', 'loading');
                }
              });
              
              // Check for existing JWT on page load
              async function checkForExistingJWT() {
                try {
                  const timestamp = new Date().getTime();
                  const { getVincentWebAppClient } = await import(\`https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js?t=\${timestamp}\`);
                  const vincentAppClient = getVincentWebAppClient({ appId });
                  
                  if (vincentAppClient.isLoginUri && vincentAppClient.isLoginUri()) {
                    showStatus('<span class="spinner"></span>Processing existing Vincent consent...', 'loading');
                    
                    const { decodedJWT, jwtStr } = vincentAppClient.decodeVincentLoginJWT(window.location.href);
                    
                    // Clean up the URL
                    vincentAppClient.removeLoginJWTFromURI();
                    
                    // Send JWT to callback endpoint
                    const response = await fetch(redirectUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        jwt: jwtStr, 
                        source: 'vincent_consent_page_auto',
                        decodedJWT: decodedJWT 
                      })
                    });
                    
                    if (response.ok) {
                      showStatus('✅ Vincent consent completed successfully! You can close this window.', 'success');
                      return true;
                    } else {
                      throw new Error('Failed to process JWT');
                    }
                  }
                  return false;
                } catch (error) {
                  console.log('No existing JWT found or error checking:', error);
                  return false;
                }
              }
              
              // Initialize page
              checkForExistingJWT().then(hasJWT => {
                if (!hasJWT) {
                  showStatus('✅ Ready to grant permissions. Click the button above to continue.', 'success');
                }
              });
            </script>
          </body>
        </html>
      `);
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
