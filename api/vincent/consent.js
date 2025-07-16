// Vincent Consent Page - Browser-Compatible Implementation
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
              const redirectUrl = '${redirectUrl}';
              const statusDiv = document.getElementById('status');
              const consentButton = document.getElementById('consentButton');
              
              function showStatus(message, type = 'loading') {
                statusDiv.innerHTML = message;
                statusDiv.className = 'status ' + type;
                statusDiv.style.display = 'block';
                console.log('Status:', message);
              }
              
              // Vincent consent button handler - PROPER BROWSER IMPLEMENTATION
              consentButton.addEventListener('click', async function() {
                console.log('🚀 Grant Permission button clicked - Starting Vincent authentication');
                console.log('Current URL:', window.location.href);
                console.log('App ID:', appId);
                
                consentButton.disabled = true;
                showStatus('<span class="spinner"></span>Loading Vincent SDK...', 'loading');
                
                try {
                  // Method 1: Try Vincent SDK with proper error handling
                  console.log('Loading Vincent SDK...');
                  const timestamp = Date.now();
                  const randomId = Math.random().toString(36).substring(7);
                  const sdkUrl = 'https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js?v=' + randomId + '&t=' + timestamp;
                  
                  console.log('SDK URL:', sdkUrl);
                  const vincentModule = await import(sdkUrl);
                  console.log('Vincent module loaded:', Object.keys(vincentModule));
                  
                  const { getVincentWebAppClient } = vincentModule;
                  console.log('getVincentWebAppClient type:', typeof getVincentWebAppClient);
                  
                  const vincentAppClient = getVincentWebAppClient({ appId: appId });
                  console.log('Vincent client created:', vincentAppClient);
                  console.log('Available methods:', Object.keys(vincentAppClient));
                  
                  showStatus('<span class="spinner"></span>Redirecting to Vincent consent page...', 'loading');
                  
                  // Use the official Vincent SDK method
                  console.log('Calling redirectToConsentPage with redirectUri:', window.location.href);
                  
                  // This should redirect to Vincent's consent page
                  const result = vincentAppClient.redirectToConsentPage({ 
                    redirectUri: window.location.href 
                  });
                  
                  console.log('redirectToConsentPage result:', result);
                  
                  // If we get here, the redirect should have happened
                  showStatus('✅ Redirecting to Vincent authentication...', 'success');
                  
                } catch (sdkError) {
                  console.error('❌ Vincent SDK failed with error:', sdkError);
                  console.error('Error details:', sdkError.message);
                  console.error('Error stack:', sdkError.stack);
                  
                  showStatus('⚠️ Vincent SDK failed, trying direct URL...', 'error');
                  
                  // Method 2: Direct URL fallback (what Vincent SDK should do)
                  try {
                    const directUrl = 'https://dashboard.heyvincent.ai/appId/' + appId + '/consent?redirectUri=' + encodeURIComponent(window.location.href);
                    console.log('Direct Vincent URL:', directUrl);
                    
                    showStatus('🔄 Opening Vincent consent page directly...', 'loading');
                    
                    // Try the same method Vincent SDK uses
                    window.open(directUrl, '_self');
                    
                    // If we get here, show success
                    showStatus('✅ Redirecting to Vincent...', 'success');
                    
                  } catch (directError) {
                    console.error('❌ Direct URL failed:', directError);
                    showStatus('❌ Direct redirect failed. Showing manual link...', 'error');
                    
                    // Method 3: Manual link
                    const manualUrl = 'https://dashboard.heyvincent.ai/appId/' + appId + '/consent?redirectUri=' + encodeURIComponent(window.location.href);
                    setTimeout(() => {
                      statusDiv.innerHTML += '<div style="margin-top: 15px; padding: 15px; background: #f0f0f0; border-radius: 8px;"><strong>Manual Access:</strong><br><a href="' + manualUrl + '" target="_blank" style="color: #667eea; font-weight: bold; text-decoration: none;">🔗 Click here to open Vincent Consent Page</a></div>';
                    }, 1000);
                  }
                }
                
                // Re-enable button after delay
                setTimeout(() => {
                  consentButton.disabled = false;
                }, 5000);
              });
              
              // Initialize page
              console.log('Page initialized');
              console.log('Window object available:', typeof window !== 'undefined');
              console.log('Current location:', window.location.href);
              showStatus('✅ Ready to authenticate. Click the button above to continue.', 'success');
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
