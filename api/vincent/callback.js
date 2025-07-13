// Vincent Authentication Callback Handler

export default async function handler (req, res) {
  // Enable CORS for Vincent domains and bypass Vercel protection
  res.setHeader('Access-Control-Allow-Origin', 'https://vincent.domains');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');
  res.setHeader('x-vercel-protection-bypass', process.env.VERCEL_PROTECTION_BYPASS_SECRET || '');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { method, query, body } = req;

    console.log('Vincent callback received:', {
      method,
      query,
      timestamp: new Date().toISOString()
    });

    if (method === 'GET') {
      // Handle GET callback (authorization code flow)
      const { code, state, error } = query;

      if (error) {
        console.error('Vincent authorization error:', error);
        return res.status(400).json({
          success: false,
          error: 'Authorization failed',
          details: error
        });
      }

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'Missing authorization code'
        });
      }

      // Store the authorization code temporarily (in production, use a proper database)
      // For now, we'll return it to the client
      console.log('Vincent authorization successful:', { code, state });
      return res.status(200).json({
        success: true,
        message: 'Vincent authorization successful',
        code,
        state,
        redirectUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
      });
    }

    if (method === 'POST') {
      // Handle POST callback (webhook notifications)
      const { type, data } = body;

      console.log('Vincent webhook received:', { type, data });
      // Process different webhook types
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
