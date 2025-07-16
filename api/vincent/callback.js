// Vincent Authentication Callback Handler
export default async function handler(req, res) {
  // Enable CORS for Vincent domains
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { method, query, body } = req;
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const appId = process.env.VINCENT_APP_ID || '983';

    console.log('Vincent callback received:', {
      method,
      query,
      timestamp: new Date().toISOString()
    });

    if (method === 'GET') {
      // Handle GET callback - JWT should be in URL parameters
      const { jwt, error } = query;

      if (error) {
        console.error('Vincent authorization error:', error);
        return res.status(400).send(`
          <html>
            <head>
              <title>Vincent Authentication Error</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
                .message { color: #666; font-size: 16px; margin-bottom: 15px; }
                .link { color: #007bff; text-decoration: none; }
              </style>
            </head>
            <body>
              <div class="error">❌ Authentication Error</div>
              <div class="message">Error: ${error}</div>
              <div class="message">
                <a href="/api/vincent/consent" class="link">Try Again</a>
              </div>
            </body>
          </html>
        `);
      }

      // Check for JWT token in query parameters
      if (jwt) {
        try {
          // Store the JWT token for the consent manager
          const fs = await import('fs');
          const path = await import('path');
          
          const consentData = {
            jwt: jwt,
            timestamp: Date.now(),
            callback: true,
            method: 'GET',
            source: 'url_parameter'
          };
          
          const consentFilePath = path.join(process.cwd(), '.vincent-consent-callback.json');
          fs.writeFileSync(consentFilePath, JSON.stringify(consentData, null, 2));
          
          console.log('Vincent consent completed with JWT');
          
          return res.status(200).send(`
            <html>
              <head>
                <title>Vincent Authentication Complete</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                  .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
                  .message { color: #666; font-size: 16px; margin-bottom: 15px; }
                </style>
              </head>
              <body>
                <div class="success">✅ Vincent Authentication Complete!</div>
                <div class="message">Your trading agent now has permission to execute trades.</div>
                <div class="message">You can close this window and return to your trading agent.</div>
              </body>
            </html>
          `);
        } catch (error) {
          console.error('Error storing consent callback:', error);
          return res.status(500).send(`
            <html>
              <head>
                <title>Vincent Callback Error</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                  .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
                  .message { color: #666; font-size: 16px; margin-bottom: 15px; }
                </style>
              </head>
              <body>
                <div class="error">❌ Processing Error</div>
                <div class="message">Failed to store authentication data</div>
              </body>
            </html>
          `);
        }
      }

      // No JWT in query parameters - show callback page with SDK detection
      return res.status(200).send(`
        <html>
          <head>
            <title>Vincent Callback</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .info { color: #007bff; font-size: 24px; margin-bottom: 20px; }
              .message { color: #666; font-size: 16px; margin-bottom: 15px; }
              .link { color: #007bff; text-decoration: none; }
              .success { color: #28a745; }
              .error { color: #dc3545; }
              .loading { color: #ffc107; }
            </style>
          </head>
          <body>
            <div class="info">🔗 Vincent Callback</div>
            <div id="status" class="message loading">Checking for authentication token...</div>
            
            <script type="module">
              async function processVincentCallback() {
                const statusDiv = document.getElementById('status');
                
                try {
                  // Import Vincent Web App Client
                  const { getVincentWebAppClient } = await import('https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js');
                  
                  const vincentAppClient = getVincentWebAppClient({ appId: '${appId}' });
                  
                  // Check if this is a login URI (has JWT token)
                  if (vincentAppClient.isLoginUri()) {
                    statusDiv.innerHTML = '🔄 Processing Vincent authentication...';
                    
                    try {
                      const { decodedJWT, jwtStr } = vincentAppClient.decodeVincentLoginJWT(window.location.origin);
                      
                      console.log('Vincent JWT found:', {
                        jwtStr: jwtStr.substring(0, 100) + '...',
                        decodedJWT: decodedJWT
                      });
                      
                      // Send JWT to server
                      const response = await fetch('/api/vincent/callback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          jwt: jwtStr, 
                          source: 'callback_page_vincent_client',
                          decodedJWT: decodedJWT 
                        })
                      });
                      
                      if (response.ok) {
                        statusDiv.innerHTML = '<div class="success">✅ Authentication Successful!</div><div class="message">Your trading agent now has permission to execute trades. You can close this window.</div>';
                        
                        // Clean up URL
                        vincentAppClient.removeLoginJWTFromURI();
                      } else {
                        const errorData = await response.json();
                        throw new Error('Server error: ' + JSON.stringify(errorData));
                      }
                    } catch (error) {
                      console.error('Error processing Vincent JWT:', error);
                      statusDiv.innerHTML = '<div class="error">❌ Error processing authentication: ' + error.message + '</div>';
                    }
                  } else {
                    statusDiv.innerHTML = '<div class="error">❌ No authentication token found in URL.</div><div class="message">Please try the consent flow again.</div>';
                  }
                } catch (error) {
                  console.error('Error:', error);
                  statusDiv.innerHTML = '<div class="error">❌ Error: ' + error.message + '</div>';
                }
              }
              
              // Process callback when page loads
              processVincentCallback();
            </script>
            
            <div class="message">To complete the authentication flow:</div>
            <div class="message">1. Go to <a href="/api/vincent/consent" class="link">Vincent Consent Page</a></div>
            <div class="message">2. Complete the consent process</div>
            <div class="message">3. You will be redirected back here with the authentication token</div>
          </body>
        </html>
      `);
    }

    if (method === 'POST') {
      // Handle POST callback (JWT processing from frontend)
      const { jwt, source, decodedJWT } = body;

      console.log('Vincent POST callback received:', { 
        hasJWT: !!jwt,
        source,
        hasDecodedJWT: !!decodedJWT
      });

      if (jwt) {
        try {
          // Verify JWT using Vincent SDK
          const { jwt: jwtUtils } = await import('@lit-protocol/vincent-app-sdk');
          const { verify } = jwtUtils;
          
          // Verify the JWT
          const allowedAudience = baseUrl;
          const verifiedJWT = verify(jwt, allowedAudience);
          
          console.log('Vincent JWT verified successfully:', {
            pkpAddress: verifiedJWT.payload.pkp?.ethAddress,
            appId: verifiedJWT.payload.app?.id,
            expiration: new Date(verifiedJWT.payload.exp * 1000).toISOString()
          });

          // Store the verified JWT for consent manager
          const fs = await import('fs');
          const path = await import('path');
          
          const consentData = {
            jwt: jwt,
            timestamp: Date.now(),
            callback: true,
            method: 'POST',
            source: source || 'unknown',
            decodedJWT: decodedJWT || verifiedJWT,
            verified: true,
            pkpAddress: verifiedJWT.payload.pkp?.ethAddress,
            pkpTokenId: verifiedJWT.payload.pkp?.tokenId
          };
          
          const consentFilePath = path.join(process.cwd(), '.vincent-consent-callback.json');
          fs.writeFileSync(consentFilePath, JSON.stringify(consentData, null, 2));
          
          console.log('Vincent consent completed and verified');
          
          return res.status(200).json({
            success: true,
            message: 'JWT token received and verified successfully',
            pkpAddress: verifiedJWT.payload.pkp?.ethAddress
          });
        } catch (error) {
          console.error('Error verifying JWT:', error);
          return res.status(400).json({
            success: false,
            error: 'JWT verification failed',
            details: error.message
          });
        }
      }

      // Handle other POST webhook types
      const { type, data } = body;
      
      if (type === 'consent') {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const consentFilePath = path.join(process.cwd(), '.vincent-consent-callback.json');
          fs.writeFileSync(consentFilePath, JSON.stringify(data, null, 2));
          console.log('Vincent consent callback stored successfully');
          return res.status(200).json({
            success: true,
            message: 'Consent callback processed successfully'
          });
        } catch (error) {
          console.error('Error storing consent callback:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to store consent callback'
          });
        }
      }

      // Process other webhook types
      switch (type) {
        case 'policy_executed':
          console.log('Policy executed:', data);
          break;
        case 'transaction_approved':
          console.log('Transaction approved:', data);
          break;
        case 'transaction_rejected':
          console.log('Transaction rejected:', data);
          break;
        default:
          console.log('Unknown webhook type:', type);
      }

      return res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  } catch (error) {
    console.error('Vincent callback error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}