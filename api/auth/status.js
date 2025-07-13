// Authentication Status API
export default async function handler(req, res) {
  // Enable CORS and bypass Vercel protection
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');
  res.setHeader('x-vercel-protection-bypass', process.env.VERCEL_PROTECTION_BYPASS_SECRET || '');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    
    return res.status(200).json({
      success: true,
      status: {
        environment: process.env.NODE_ENV || 'development',
        baseUrl,
        vincent: {
          appId: process.env.VINCENT_APP_ID || '983',
          callbackUrl: `${baseUrl}/api/vincent/callback`,
          consentUrl: `${baseUrl}/api/vincent/consent`,
          litNetwork: process.env.LIT_NETWORK || 'datil-dev',
          configured: !!(process.env.VINCENT_APP_ID && process.env.LIT_CAPACITY_CREDIT_TOKEN_ID)
        },
        gaia: {
          configured: !!(process.env.GAIA_API_KEY && process.env.GAIA_NODE_URL),
          nodeUrl: process.env.GAIA_NODE_URL
        },
        trading: {
          pairs: (process.env.TRADING_PAIRS || 'BTC/USDT,ETH/USDT,SOL/USDC').split(','),
          simulationMode: process.env.SIMULATION_MODE === 'true'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Auth status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}