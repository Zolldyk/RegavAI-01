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
      const redirectUrl = 'https://regav-cy5e3es1n-zoldycks-projects-8a6a6155.vercel.app/api/vincent/callback';

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
              
              <div id="status" class="status" style="display: none;"></div>
              
              <div class="info">
                App ID: ${appId}<br>
                Redirect URL: ${redirectUrl}<br>
                Risk Level: MODERATE
              </div>
            </div>
            
            <!-- Try loading Vincent SDK via script tag first -->
            <script src="https://cdn.jsdelivr.net/npm/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js" 
                    onerror="console.log('Script tag failed to load Vincent SDK')"></script>
            
            <script type="module">
              const appId = '${appId}';
              const redirectUrl = '${redirectUrl}';
              const statusDiv = document.getElementById('status');
              const consentButton = document.getElementById('consentButton');
              
              function showStatus(message, type = 'loading') {
                if (statusDiv) {
                  statusDiv.innerHTML = message;
                  statusDiv.className = 'status ' + type;
                  statusDiv.style.display = 'block';
                }
                console.log('Status:', message);
              }
              
              // Test the Vincent SDK directly when button is clicked
              consentButton.addEventListener('click', async function() {
                console.log('Button clicked - starting Vincent authentication');
                showStatus('🔄 Loading Vincent SDK...', 'loading');
                
                try {
                  // Test Vincent SDK import - try multiple CDNs
                  console.log('Importing Vincent SDK...');
                  let vincentModule;
                  
                  try {
                    // Try jsdelivr first
                    console.log('Trying jsdelivr CDN...');
                    vincentModule = await import('https://cdn.jsdelivr.net/npm/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js');
                  } catch (e1) {
                    console.log('jsdelivr failed:', e1);
                    try {
                      // Try unpkg
                      console.log('Trying unpkg CDN...');
                      vincentModule = await import('https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js');
                    } catch (e2) {
                      console.log('unpkg failed:', e2);
                      try {
                        // Try ESM.sh
                        console.log('Trying esm.sh CDN...');
                        vincentModule = await import('https://esm.sh/@lit-protocol/vincent-app-sdk@1.0.2');
                      } catch (e3) {
                        console.log('esm.sh failed:', e3);
                        try {
                          // Try without version
                          console.log('Trying latest version...');
                          vincentModule = await import('https://cdn.jsdelivr.net/npm/@lit-protocol/vincent-app-sdk@latest/dist/src/index.js');
                        } catch (e4) {
                          console.log('All CDNs failed:', e4);
                          
                          // Check if Vincent SDK was loaded via script tag
                          if (window.VincentSDK) {
                            console.log('Using Vincent SDK from script tag');
                            vincentModule = window.VincentSDK;
                          } else {
                            // Last resort - try to create a manual redirect
                            console.log('Creating manual redirect as fallback');
                            showStatus('🔄 Using fallback redirect method...', 'loading');
                            
                            // Create a manual redirect to Vincent consent page
                            // This URL pattern is based on standard OAuth flows
                            const params = new URLSearchParams({
                              client_id: appId,
                              redirect_uri: window.location.href,
                              response_type: 'code',
                              scope: 'vincent_consent'
                            });
                            
                            const vincentConsentUrl = \`https://consent.litprotocol.com/authorize?\${params.toString()}\`;
                            console.log('Manual redirect URL:', vincentConsentUrl);
                            
                            showStatus('🔄 Redirecting to Vincent (manual)...', 'loading');
                            window.location.href = vincentConsentUrl;
                            return;
                          }
                        }
                      }
                    }
                  }
                  console.log('Vincent SDK imported:', vincentModule);
                  
                  const { getVincentWebAppClient, jwt } = vincentModule;
                  console.log('Vincent functions:', { getVincentWebAppClient, jwt });
                  
                  // Create Vincent client
                  console.log('Creating Vincent client with appId:', appId);
                  const vincentAppClient = getVincentWebAppClient({ appId });
                  console.log('Vincent client created:', vincentAppClient);
                  
                  // Test available methods
                  console.log('Available methods:', Object.keys(vincentAppClient));
                  
                  // Check if we're returning from Vincent with a JWT
                  // Try both method names to see which one exists
                  const hasIsLogin = typeof vincentAppClient.isLogin === 'function';
                  const hasIsLoginUri = typeof vincentAppClient.isLoginUri === 'function';
                  
                  console.log('Method availability:', { hasIsLogin, hasIsLoginUri });
                  
                  let isReturningFromVincent = false;
                  
                  if (hasIsLoginUri) {
                    isReturningFromVincent = vincentAppClient.isLoginUri();
                    console.log('isLoginUri() result:', isReturningFromVincent);
                  } else if (hasIsLogin) {
                    isReturningFromVincent = vincentAppClient.isLogin();
                    console.log('isLogin() result:', isReturningFromVincent);
                  }
                  
                  if (isReturningFromVincent) {
                    showStatus('🔄 Processing Vincent consent...', 'loading');
                    
                    const { decodedJWT, jwtStr } = vincentAppClient.decodeVincentLoginJWT(window.location.origin);
                    
                    // Store JWT for later use
                    localStorage.setItem('VINCENT_AUTH_JWT', jwtStr);
                    
                    // Clean up the URL
                    vincentAppClient.removeLoginJWTFromURI();
                    
                    // Send JWT to callback endpoint
                    const response = await fetch('${redirectUrl}', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        jwt: jwtStr, 
                        source: 'vincent_web_app_client',
                        decodedJWT: decodedJWT 
                      })
                    });
                    
                    if (response.ok) {
                      showStatus('✅ Vincent consent completed successfully! You can close this window.', 'success');
                    } else {
                      throw new Error('Failed to process JWT');
                    }
                  } else {
                    showStatus('🔄 Redirecting to Vincent...', 'loading');
                    
                    // Test redirect function
                    console.log('Calling redirectToConsentPage...');
                    console.log('Redirect URI:', window.location.href);
                    
                    // Call redirect to Vincent consent page
                    vincentAppClient.redirectToConsentPage({ redirectUri: window.location.href });
                    
                    // If we get here, the redirect didn't work
                    showStatus('❌ Redirect failed - page should have redirected to Vincent', 'error');
                  }
                } catch (error) {
                  console.error('Error with Vincent:', error);
                  showStatus('❌ Error: ' + error.message, 'error');
                }
              });
              
              // Set initial status
              showStatus('✅ Ready to grant permissions. Click the button above.', 'success');
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
