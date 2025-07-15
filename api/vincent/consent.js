// Vincent Consent Page Handler
export default async function handler(req, res) {
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
            
            <script type="module">
              import { getVincentWebAppClient, jwt } from 'https://cdn.jsdelivr.net/npm/@lit-protocol/vincent-app-sdk@latest/dist/index.js';
              
              const appId = '${appId}';
              const redirectUrl = '${redirectUrl}';
              const statusDiv = document.getElementById('status');
              const consentButton = document.getElementById('consentButton');
              
              const { isExpired } = jwt;
              
              function showStatus(message, type = 'loading') {
                statusDiv.innerHTML = message;
                statusDiv.className = 'status ' + type;
                statusDiv.style.display = 'block';
              }
              
              async function initVincent() {
                try {
                  const vincentAppClient = getVincentWebAppClient({ appId });
                  
                  // Check if we're returning from Vincent with a JWT (using correct method name)
                  if (vincentAppClient.isLogin()) {
                    showStatus('🔄 Processing Vincent consent...', 'loading');
                    
                    try {
                      // According to Vincent docs, use redirectUrl as the expected audience
                      const result = vincentAppClient.decodeVincentLoginJWT(window.location.href);
                      
                      if (result) {
                        const { decodedJWT, jwtStr } = result;
                        
                        console.log('Vincent JWT received:', {
                          jwtStr: jwtStr.substring(0, 100) + '...',
                          decodedJWT: decodedJWT
                        });
                        
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
                          vincentAppClient.removeLoginJWTFromURI();
                        } else {
                          const errorData = await response.json();
                          throw new Error('Failed to process JWT: ' + JSON.stringify(errorData));
                        }
                      } else {
                        throw new Error('No JWT found in URL');
                      }
                    } catch (error) {
                      console.error('Error processing Vincent JWT:', error);
                      showStatus('❌ Error processing consent: ' + error.message, 'error');
                    }
                  } else {
                    // Check for stored JWT
                    const storedJwt = localStorage.getItem('VINCENT_AUTH_JWT');
                    const expired = storedJwt ? isExpired(storedJwt) : true;
                    
                    if (!storedJwt || expired) {
                      // Set up consent button
                      consentButton.addEventListener('click', () => {
                        showStatus('🔄 Redirecting to Vincent...', 'loading');
                        // Use the callback URL as the redirect URI
                        vincentAppClient.redirectToConsentPage({ redirectUri: '${redirectUrl}' });
                      });
                    } else {
                      showStatus('✅ Already authenticated with Vincent', 'success');
                    }
                  }
                } catch (error) {
                  console.error('Error initializing Vincent:', error);
                  showStatus('❌ Error initializing Vincent: ' + error.message, 'error');
                }
              }
              
              // Initialize when page loads
              initVincent();
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
    console.error('Vincent consent error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}