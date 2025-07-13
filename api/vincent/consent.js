// Vincent Consent Page Handler
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
    const { method, query } = req;
    
    if (method === 'GET') {
      // Return consent page information
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      
      return res.status(200).json({
        success: true,
        consent: {
          appId: process.env.VINCENT_APP_ID || '983',
          appName: 'Regav Trading Agent',
          description: 'AI-powered cryptocurrency trading agent with risk management',
          permissions: [
            'Execute trades within spending limits',
            'Monitor portfolio performance',
            'Access market data and analysis',
            'Manage trading positions'
          ],
          policies: [
            {
              type: 'TradeAmountLimitPolicy',
              description: `Maximum trade amount: $${process.env.VINCENT_MAX_TRADE_AMOUNT || 1000}`,
              params: {
                maxAmount: process.env.VINCENT_MAX_TRADE_AMOUNT || 1000
              }
            },
            {
              type: 'TradeExpiryPolicy', 
              description: `Trade expiry: ${process.env.VINCENT_TRADE_EXPIRY_MINUTES || 10} minutes`,
              params: {
                expiryMinutes: process.env.VINCENT_TRADE_EXPIRY_MINUTES || 10
              }
            },
            {
              type: 'TokenAllowlistPolicy',
              description: 'Only trade approved tokens: BTC, ETH, SOL, XRP, USDT, USDC',
              params: {
                allowedTokens: ['BTC', 'ETH', 'SOL', 'XRP', 'USDT', 'USDC']
              }
            }
          ],
          redirectUrl: `${baseUrl}/api/vincent/callback`,
          riskLevel: 'MODERATE'
        }
      });
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