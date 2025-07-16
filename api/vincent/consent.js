// Vincent Consent Page Handler
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
      // Return consent page that uses Vincent Web App Client
      const appId = process.env.VINCENT_APP_ID || '983';
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const redirectUrl = `${baseUrl}/api/vincent/callback`;

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Vincent Consent - Regav Trading Agent</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .title { color: #333; font-size: 28px; margin-bottom: 20px; }
              .subtitle { color: #666; font-size: 18px; margin-bottom: 30px; }
              .permissions { text-align: left; margin: 20px 0; }
              .permissions h3 { color: #333; margin-bottom: 10px; }
              .permissions ul { color: #555; }
              .permissions li { margin: 8px 0; }
              .button { background: #007bff; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; margin: 20px 0; }
              .button:hover { background: #0056b3; }
              .info { color: #666; font-size: 14px; margin-top: 20px; }
              .status { margin: 20px 0; padding: 15px; border-radius: 5px; }
              .loading { background: #e3f2fd; color: #1976d2; }
              .success { background: #e8f5e8; color: #2e7d32; }
              .error { background: #ffebee; color: #c62828; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="title">🔐 Vincent Consent Required</div>
              <div class="subtitle">Regav Trading Agent needs your permission to execute trades</div>
              
              <div class="permissions">
                <h3>Permissions Requested:</h3>
                <ul>
                  <li>Execute trades within spending limits</li>
                  <li>Monitor portfolio performance</li>
                  <li>Access market data and analysis</li>
                  <li>Manage trading positions</li>
                </ul>
                
                <h3>Safety Policies:</h3>
                <ul>
                  <li>Maximum trade amount: $${process.env.VINCENT_MAX_TRADE_AMOUNT || 1000}</li>
                  <li>Trade expiry: ${process.env.VINCENT_TRADE_EXPIRY_MINUTES || 10} minutes</li>
                  <li>Only approved tokens: BTC, ETH, SOL, XRP, USDT, USDC</li>
                </ul>
              </div>
              
              <button id="consentButton" class="button">Grant Permission</button>
              <button id="directButton" class="button" style="background: #ff6b35; margin-top: 10px;">🔗 Direct Vincent Link</button>
              <button id="ownerButton" class="button" style="background: #28a745; margin-top: 10px;">👑 Owner Auto-Grant</button>
              
              <div id="status" class="status" style="display: none;"></div>
              
              <div class="info">
                App ID: ${appId}<br>
                Redirect URL: ${redirectUrl}<br>
                Risk Level: MODERATE
              </div>
            </div>
            
            <script type="module">
              const appId = '${appId}';
              const redirectUrl = '${redirectUrl}';
              const statusDiv = document.getElementById('status');
              const consentButton = document.getElementById('consentButton');
              const directButton = document.getElementById('directButton');
              const ownerButton = document.getElementById('ownerButton');
              
              function showStatus(message, type = 'loading') {
                if (statusDiv) {
                  statusDiv.innerHTML = message;
                  statusDiv.className = 'status ' + type;
                  statusDiv.style.display = 'block';
                }
                console.log('Status:', message);
              }
              
              // Check if we're already returning from Vincent on page load
              async function checkForExistingJWT() {
                try {
                  // Import Vincent SDK
                  const timestamp = new Date().getTime();
                  const vincentUrl = \`https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js?t=\${timestamp}\`;
                  const vincentModule = await import(vincentUrl);
                  const { getVincentWebAppClient } = vincentModule;
                  
                  const vincentAppClient = getVincentWebAppClient({ appId });
                  
                  // Check if this is a login URI with JWT token
                  if (vincentAppClient.isLoginUri()) {
                    showStatus('🔄 Processing existing Vincent consent...', 'loading');
                    
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
                  console.error('Error checking for existing JWT:', error);
                  return false;
                }
              }
              
              // Simple direct approach - just open Vincent consent page
              consentButton.addEventListener('click', function() {
                console.log('Grant Permission button clicked');
                showStatus('🔄 Opening Vincent consent page...', 'loading');
                
                // Use multiple Vincent consent URL formats
                const vincentUrls = [
                  \`https://dashboard.heyvincent.ai/\${appId}/consent?redirectUri=\${encodeURIComponent(window.location.href)}\`,
                  \`https://app.vincent.domains/consent?appId=\${appId}&redirectUrl=\${encodeURIComponent(window.location.href)}\`,
                  \`https://vincent.domains/consent?appId=\${appId}&redirectUrl=\${encodeURIComponent(window.location.href)}\`
                ];
                
                console.log('Opening Vincent URLs:', vincentUrls);
                
                // Open the first URL
                window.open(vincentUrls[0], '_blank');
                showStatus('✅ Vincent consent page opened in new tab. Complete the process there and return here.', 'success');
                
                // Also try SDK approach in parallel
                setTimeout(async () => {
                  try {
                    console.log('Attempting Vincent SDK approach...');
                    const { getVincentWebAppClient } = await import('https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js');
                    const vincentAppClient = getVincentWebAppClient({ appId });
                    
                    // Try to redirect with SDK if available
                    if (vincentAppClient.redirectToLoginPage) {
                      vincentAppClient.redirectToLoginPage({ redirectUri: window.location.href });
                    } else if (vincentAppClient.redirectToConsentPage) {
                      vincentAppClient.redirectToConsentPage({ redirectUri: window.location.href });
                    }
                  } catch (error) {
                    console.log('Vincent SDK fallback failed:', error.message);
                  }
                }, 500);
              });
              
              // Direct Vincent link button
              directButton.addEventListener('click', function() {
                console.log('Direct Vincent link button clicked');
                showStatus('🔗 Opening Vincent dashboard directly...', 'loading');
                
                const vincentDashboard = \`https://dashboard.heyvincent.ai/\${appId}/consent?redirectUri=\${encodeURIComponent(window.location.href)}\`;
                window.open(vincentDashboard, '_blank');
                showStatus('✅ Vincent dashboard opened. Complete consent there and return here.', 'success');
              });
              
              // Owner auto-grant button
              ownerButton.addEventListener('click', function() {
                console.log('Owner auto-grant button clicked');
                
                const confirmOwner = confirm('Are you the owner of this trading agent? This will bypass Vincent consent and auto-grant permissions.');
                
                if (confirmOwner) {
                  showStatus('🔄 Auto-granting owner permissions...', 'loading');
                  
                  // Create owner auto-grant JWT
                  const ownerJWT = {
                    jwt: 'owner-auto-grant-' + Date.now(),
                    timestamp: Date.now(),
                    source: 'owner_auto_grant',
                    ownerBypass: true,
                    pkpTokenId: '${process.env.VINCENT_PKP_TOKEN_ID || 'auto-grant-pkp-token'}'
                  };
                  
                  // Send to callback endpoint
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
              checkForExistingJWT().then(hasJWT => {
                if (!hasJWT) {
                  showStatus('✅ Ready to grant permissions. Click the button above.', 'success');
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
