// Vincent PKP Token ID Retrieval Handler
import { getVincentWebAppClient } from '@lit-protocol/vincent-app-sdk';

export default async function handler(req, res) {
  // Enable CORS and bypass Vercel protection
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');
  res.setHeader('x-vercel-protection-bypass', process.env.VERCEL_PROTECTION_BYPASS_SECRET || '');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Return HTML page for PKP token ID extraction
      const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Vincent PKP Token ID Retrieval</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .step { margin: 20px 0; padding: 15px; border-left: 4px solid #007cba; background: #f8f9fa; }
        .token-display { background: #e8f4f8; padding: 15px; border-radius: 4px; margin: 10px 0; font-family: monospace; }
        button { background: #007cba; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        .success { color: #28a745; font-weight: bold; }
        .error { color: #dc3545; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔑 Get Your Vincent PKP Token ID</h1>
        
        <div class="step">
            <h3>Step 1: Start Vincent Consent</h3>
            <p>Click this button to start the Vincent consent flow:</p>
            <button onclick="startVincentConsent()">🚀 Start Vincent Consent Flow</button>
            <div id="consentStatus"></div>
        </div>

        <div class="step">
            <h3>Step 2: Extract PKP Token ID</h3>
            <p>After completing consent, your PKP token ID will appear here:</p>
            <div id="tokenResult"></div>
            <button onclick="extractPkpToken()">🔍 Extract PKP Token ID</button>
        </div>

        <div class="step">
            <h3>Step 3: Update .env File</h3>
            <div id="envInstructions"></div>
        </div>
    </div>

    <script>
        async function startVincentConsent() {
            const statusDiv = document.getElementById('consentStatus');
            statusDiv.innerHTML = '<p>🔄 Initializing Vincent consent flow...</p>';
            
            try {
                // Use your Vercel deployment as proxy
                const baseUrl = window.location.origin;
                const redirectUrl = baseUrl + '/api/vincent/callback';
                
                const vincentUrls = [
                    \`https://vincent.domains/consent?appId=983&redirectUrl=\${encodeURIComponent(redirectUrl)}\`,
                    \`https://app.vincent.domains/consent?appId=983&redirectUrl=\${encodeURIComponent(redirectUrl)}\`,
                    \`https://staging.vincent.domains/consent?appId=983&redirectUrl=\${encodeURIComponent(redirectUrl)}\`
                ];
                
                statusDiv.innerHTML = \`
                    <p>🔗 Try these Vincent consent URLs:</p>
                    <div class="token-display">
                        \${vincentUrls.map((url, i) => \`<a href="\${url}" target="_blank">Option \${i+1}: Vincent Consent</a><br>\`).join('')}
                    </div>
                    <p><em>After completing consent, you'll be redirected back to extract your PKP token ID.</em></p>
                \`;
                
                // Try to open the first URL
                window.open(vincentUrls[0], '_blank');
                
            } catch (error) {
                statusDiv.innerHTML = \`<p class="error">❌ Error: \${error.message}</p>\`;
            }
        }

        async function extractPkpToken() {
            const resultDiv = document.getElementById('tokenResult');
            const envDiv = document.getElementById('envInstructions');
            
            resultDiv.innerHTML = '<p>🔍 Checking for PKP token ID...</p>';
            
            try {
                // Check URL parameters first
                const urlParams = new URLSearchParams(window.location.search);
                let pkpTokenId = null;
                
                // Look for JWT in URL params
                if (urlParams.has('jwt')) {
                    const jwt = urlParams.get('jwt');
                    const payload = JSON.parse(atob(jwt.split('.')[1]));
                    pkpTokenId = payload.pkp?.tokenId;
                }
                
                // Check local storage
                if (!pkpTokenId) {
                    const storedTokenId = localStorage.getItem('vincent_pkp_token_id');
                    const storedUserInfo = localStorage.getItem('vincent_user_info');
                    
                    if (storedTokenId) {
                        pkpTokenId = storedTokenId;
                    } else if (storedUserInfo) {
                        const userInfo = JSON.parse(storedUserInfo);
                        pkpTokenId = userInfo.pkpTokenId;
                    }
                }
                
                if (pkpTokenId) {
                    resultDiv.innerHTML = \`
                        <div class="success">✅ PKP Token ID Found!</div>
                        <div class="token-display">
                            <strong>Your PKP Token ID:</strong><br>
                            <code>\${pkpTokenId}</code>
                        </div>
                    \`;
                    
                    envDiv.innerHTML = \`
                        <div class="success">📝 Update your .env file:</div>
                        <div class="token-display">
                            VINCENT_PKP_TOKEN_ID=\${pkpTokenId}
                        </div>
                        <p>1. Copy the line above</p>
                        <p>2. Replace the existing VINCENT_PKP_TOKEN_ID line in your .env file</p>
                        <p>3. Restart your trading agent</p>
                    \`;
                } else {
                    resultDiv.innerHTML = \`
                        <div class="error">❌ PKP Token ID not found</div>
                        <p>Please complete the Vincent consent flow first, then try again.</p>
                    \`;
                }
                
            } catch (error) {
                resultDiv.innerHTML = \`<p class="error">❌ Error extracting PKP token ID: \${error.message}</p>\`;
            }
        }
        
        // Auto-extract on page load if we have URL parameters
        window.onload = function() {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('jwt') || urlParams.has('code')) {
                extractPkpToken();
            }
        };
    </script>
</body>
</html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('Vincent PKP token retrieval error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}