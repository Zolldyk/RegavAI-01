// Vincent Authentication Callback Handler

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
    const { method, query, body } = req;

    console.log('Vincent callback received:', {
      method,
      query,
      allParams: Object.keys(query),
      queryString: req.url,
      timestamp: new Date().toISOString()
    });

    if (method === 'GET') {
      // Handle GET callback (authorization code flow)
      // According to Vincent docs, JWT is returned as a URL parameter
      const { code, state, error, jwt, token, access_token, id_token, vincentJWT, vincentLoginJWT, lit_jwt, lit_token } = query;
      // Check for JWT token (various parameter names Vincent might use)
      const jwtToken = jwt || token || access_token || id_token || vincentJWT || vincentLoginJWT || lit_jwt || lit_token;
      console.log('Callback parameter analysis:', {
        hasCode: !!code,
        hasJWT: !!jwtToken,
        hasError: !!error,
        jwtSource: jwt ? 'jwt' : token ? 'token' : access_token ? 'access_token' : id_token ? 'id_token' : vincentJWT ? 'vincentJWT' : vincentLoginJWT ? 'vincentLoginJWT' : lit_jwt ? 'lit_jwt' : lit_token ? 'lit_token' : 'none',
        allParamNames: Object.keys(query),
        queryValues: query
      });

      if (error) {
        console.error('Vincent authorization error:', error);
        return res.status(400).json({
          success: false,
          error: 'Authorization failed',
          details: error
        });
      }

      // Check for JWT token (direct consent completion)
      if (jwtToken) {
        try {
          // Store the JWT token for consent manager to pick up
          const fs = await import('fs');
          const path = await import('path');
          
          const consentData = {
            jwt: jwtToken,
            timestamp: Date.now(),
            callback: true,
            method: 'GET',
            source: 'url_parameter'
          };
          
          const consentFilePath = path.join(process.cwd(), '.vincent-consent-callback.json');
          fs.writeFileSync(consentFilePath, JSON.stringify(consentData, null, 2));
          
          console.log('Vincent consent completed with JWT:', { jwt: jwtToken.substring(0, 50) + '...' });
          
          return res.status(200).send(`
            <html>
              <head>
                <title>Vincent Consent Complete</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                  .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
                  .message { color: #666; font-size: 16px; }
                </style>
              </head>
              <body>
                <div class="success">✅ Vincent Consent Complete!</div>
                <div class="message">Your trading agent now has permission to execute trades.</div>
                <div class="message">You can close this window and return to your trading agent.</div>
              </body>
            </html>
          `);
        } catch (error) {
          console.error('Error storing consent callback:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to store consent data'
          });
        }
      }

      // Handle authorization code flow
      if (!code && !jwtToken) {
        // If no code or JWT, show a helpful message with debug info
        return res.status(200).send(`
          <html>
            <head>
              <title>Vincent Callback</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .info { color: #007bff; font-size: 24px; margin-bottom: 20px; }
                .message { color: #666; font-size: 16px; margin-bottom: 15px; }
                .link { color: #007bff; text-decoration: none; }
                .debug { background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; font-family: monospace; font-size: 14px; }
                .success { color: #28a745; }
                .error { color: #dc3545; }
              </style>
            </head>
            <body>
              <div class="info">🔗 Vincent Callback Endpoint</div>
              <div class="message">This is the Vincent consent callback endpoint.</div>
              <div id="status" class="message">Checking for JWT token...</div>
              
              <div class="debug">
                <strong>Debug Info:</strong><br>
                URL: ${req.url}<br>
                Parameters: ${JSON.stringify(query, null, 2)}<br>
                Expected: jwt, token, access_token, id_token, or code<br>
              </div>
              
              <script type="module">
                async function processJWT() {
                  const statusDiv = document.getElementById('status');
                  
                  try {
                    // Import Vincent Web App Client
                    const timestamp = new Date().getTime();
                    const { getVincentWebAppClient } = await import(\`https://unpkg.com/@lit-protocol/vincent-app-sdk@1.0.2/dist/src/index.js?t=\${timestamp}\`);
                    
                    const vincentAppClient = getVincentWebAppClient({ appId: '${process.env.VINCENT_APP_ID || '983'}' });
                    
                    // Check if this is a login URI (has JWT token) - using correct method name
                    if (vincentAppClient.isLoginUri()) {
                      statusDiv.innerHTML = '🔄 Processing Vincent JWT token...';
                      
                      try {
                        const { decodedJWT, jwtStr } = vincentAppClient.decodeVincentLoginJWT(window.location.href);
                        
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
                          statusDiv.innerHTML = '<div class="success">✅ JWT Token Processed Successfully!</div><div class="message">Your trading agent now has permission to execute trades. You can close this window.</div>';
                          vincentAppClient.removeLoginJWTFromURI();
                        } else {
                          const errorData = await response.json();
                          throw new Error('Server error: ' + JSON.stringify(errorData));
                        }
                      } catch (error) {
                        console.error('Error processing Vincent JWT:', error);
                        statusDiv.innerHTML = '<div class="error">❌ Error processing JWT: ' + error.message + '</div>';
                      }
                    } else {
                      // Try manual methods
                      statusDiv.innerHTML = 'No JWT found via Vincent client. Checking URL manually...';
                      
                      // Check URL fragment
                      const fragment = window.location.hash.substring(1);
                      const fragmentParams = new URLSearchParams(fragment);
                      const fragmentJWT = fragmentParams.get('jwt') || fragmentParams.get('token') || fragmentParams.get('access_token') || fragmentParams.get('id_token') || fragmentParams.get('vincentJWT') || fragmentParams.get('vincentLoginJWT') || fragmentParams.get('lit_jwt') || fragmentParams.get('lit_token');
                      
                      // Check URL search params
                      const searchParams = new URLSearchParams(window.location.search);
                      const searchJWT = searchParams.get('jwt') || searchParams.get('token') || searchParams.get('access_token') || searchParams.get('id_token') || searchParams.get('vincentJWT') || searchParams.get('vincentLoginJWT') || searchParams.get('lit_jwt') || searchParams.get('lit_token');
                      
                      const jwt = fragmentJWT || searchJWT;
                      
                      if (jwt) {
                        statusDiv.innerHTML = '🔄 Found JWT token manually, processing...';
                        
                        const response = await fetch('/api/vincent/callback', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            jwt: jwt, 
                            source: fragmentJWT ? 'url_fragment' : 'url_search_params'
                          })
                        });
                        
                        if (response.ok) {
                          statusDiv.innerHTML = '<div class="success">✅ JWT Token Processed Successfully!</div><div class="message">Your trading agent now has permission to execute trades. You can close this window.</div>';
                        } else {
                          throw new Error('Failed to process JWT');
                        }
                      } else {
                        statusDiv.innerHTML = '<div class="error">❌ No JWT token found in URL parameters or fragments.</div><div class="message">Please try the consent flow again.</div>';
                      }
                    }
                  } catch (error) {
                    console.error('Error:', error);
                    statusDiv.innerHTML = '<div class="error">❌ Error: ' + error.message + '</div>';
                  }
                }
                
                // Process JWT when page loads
                processJWT();
              </script>
              
              <div class="message">To complete the consent flow:</div>
              <div class="message">1. Go to <a href="/api/vincent/consent" class="link">Vincent Consent Page</a></div>
              <div class="message">2. Complete the consent process</div>
              <div class="message">3. You will be redirected back here with the JWT token</div>
            </body>
          </html>
        `);
      }

      // Store the authorization code temporarily (in production, use a proper database)
      console.log('Vincent authorization successful:', { code, state });
      return res.status(200).json({
        success: true,
        message: 'Vincent authorization successful',
        code,
        state,
        nextStep: 'Exchange code for JWT token'
      });
    }

    if (method === 'POST') {
      // Handle POST callback (webhook notifications and consent callbacks)
      const { type, data, jwt, token, access_token, id_token, vincentJWT, vincentLoginJWT, lit_jwt, lit_token } = body;

      console.log('Vincent POST callback received:', { 
        type, 
        data, 
        hasJWT: !!(jwt || token || access_token || id_token || vincentJWT || vincentLoginJWT || lit_jwt || lit_token),
        bodyKeys: Object.keys(body)
      });
      // Check if JWT token is directly in the POST body or if it's an owner auto-grant
      const jwtToken = jwt || token || access_token || id_token || vincentJWT || vincentLoginJWT || lit_jwt || lit_token;
      const isOwnerAutoGrant = body.ownerBypass || (body.source === 'owner_auto_grant');
      
      if (jwtToken || isOwnerAutoGrant) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const consentData = {
            jwt: jwtToken || body.jwt || 'owner-auto-grant-' + Date.now(),
            timestamp: Date.now(),
            callback: true,
            method: 'POST',
            source: body.source || 'unknown',
            decodedJWT: body.decodedJWT || null,
            ownerBypass: isOwnerAutoGrant,
            pkpTokenId: body.pkpTokenId || process.env.VINCENT_PKP_TOKEN_ID
          };
          const consentFilePath = path.join(process.cwd(), '.vincent-consent-callback.json');
          fs.writeFileSync(consentFilePath, JSON.stringify(consentData, null, 2));
          console.log('Vincent consent completed (POST):', { 
            jwt: jwtToken ? jwtToken.substring(0, 50) + '...' : 'owner-auto-grant',
            source: body.source,
            hasDecodedJWT: !!body.decodedJWT,
            isOwnerAutoGrant: isOwnerAutoGrant,
            timestamp: new Date().toISOString()
          });
          return res.status(200).json({
            success: true,
            message: 'JWT token received and stored successfully'
          });
        } catch (error) {
          console.error('Error storing POST consent callback:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to store consent data'
          });
        }
      }
      if (type === 'consent') {
        // Handle consent callback from public page
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
