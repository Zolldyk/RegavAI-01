// Vincent Consent Page - Official SDK Implementation
export default async function handler (req, res) {
  // Enable CORS for Vincent domains
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const appId = process.env.VINCENT_APP_ID || '983';
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const redirectUrl = `${baseUrl}/api/vincent/callback`;

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Vincent Authentication</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { 
                font-family: Arial, sans-serif; 
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
                margin-bottom: 20px;
                font-weight: 600;
              }
              .subtitle { 
                color: #666; 
                font-size: 18px; 
                margin-bottom: 30px; 
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
              .button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
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
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="title">🔐 Vincent Authentication</div>
              <div class="subtitle">Connect your wallet and grant trading permissions</div>
              
              <button id="consentButton" class="button">
                🚀 Grant Permission
              </button>
              
              <div id="status" class="status" style="display: none;"></div>
              
              <div class="info">
                <strong>App ID:</strong> ${appId}<br>
                <strong>Redirect URL:</strong> ${redirectUrl}<br>
                <strong>Environment:</strong> datil-dev
              </div>
            </div>
            
            <script type="module">
              const appId = '${appId}';
              const statusDiv = document.getElementById('status');
              const consentButton = document.getElementById('consentButton');
              
              function showStatus(message, type = 'loading') {
                statusDiv.innerHTML = message;
                statusDiv.className = 'status ' + type;
                statusDiv.style.display = 'block';
                console.log('Status:', message);
              }
              
              // Check if this is a login return from Vincent
              async function handleVincentLogin() {
                try {
                  const { getVincentWebAppClient, jwt } = await import('https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js');
                  const { isExpired } = jwt;
                  
                  const vincentAppClient = getVincentWebAppClient({ appId: appId });
                  
                  if (vincentAppClient.isLoginUri()) {
                    showStatus('<span class="spinner"></span>Processing Vincent login...', 'loading');
                    
                    try {
                      const { decodedJWT, jwtStr } = vincentAppClient.decodeVincentLoginJWT(window.location.origin);
                      
                      // Store JWT for backend use
                      localStorage.setItem('VINCENT_AUTH_JWT', jwtStr);
                      
                      // Clean up URL
                      vincentAppClient.removeLoginJWTFromURI();
                      
                      showStatus('✅ Authentication successful! Redirecting to callback...', 'success');
                      
                      // Redirect to callback with JWT
                      setTimeout(() => {
                        window.location.href = \`${redirectUrl}?jwt=\${encodeURIComponent(jwtStr)}\`;
                      }, 1000);
                      
                      return true;
                    } catch (error) {
                      console.error('JWT processing failed:', error);
                      showStatus('❌ Authentication failed: ' + error.message, 'error');
                      return false;
                    }
                  }
                  
                  // Check for stored JWT
                  const storedJwt = localStorage.getItem('VINCENT_AUTH_JWT');
                  if (storedJwt && !isExpired(jwt.decode(storedJwt))) {
                    showStatus('✅ Already authenticated. Click button to continue.', 'success');
                    return true;
                  }
                  
                  return false;
                } catch (error) {
                  console.error('Vincent SDK initialization failed:', error);
                  return false;
                }
              }
              
              // Vincent consent button handler
              consentButton.addEventListener('click', async function() {
                consentButton.disabled = true;
                showStatus('<span class="spinner"></span>Loading Vincent SDK...', 'loading');
                
                try {
                  const { getVincentWebAppClient } = await import('https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js');
                  
                  const vincentAppClient = getVincentWebAppClient({ appId: appId });
                  
                  showStatus('<span class="spinner"></span>Redirecting to Vincent consent page...', 'loading');
                  
                  // Use the official Vincent SDK method
                  vincentAppClient.redirectToConsentPage({ 
                    redirectUri: window.location.href 
                  });
                  
                  // This should redirect the user, but if it doesn't work, show fallback
                  setTimeout(() => {
                    showStatus('If you are not redirected automatically, please check popup blockers or try again.', 'error');
                    consentButton.disabled = false;
                  }, 5000);
                  
                } catch (error) {
                  console.error('Vincent SDK error:', error);
                  showStatus('❌ Vincent SDK failed. Please try again.', 'error');
                  consentButton.disabled = false;
                }
              });
              
              // Initialize page
              window.addEventListener('load', async () => {
                const isLogin = await handleVincentLogin();
                if (!isLogin) {
                  showStatus('✅ Ready to authenticate. Click the button above to continue.', 'success');
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
