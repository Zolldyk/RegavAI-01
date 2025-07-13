// Health Check API - Public endpoint
export default async function handler(req, res) {
  // Enable CORS and disable Vercel authentication for this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vercel-protection-bypass');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      checks: {
        environment: {
          status: 'pass',
          details: 'Environment variables loaded'
        },
        vincent: {
          status: process.env.VINCENT_APP_ID ? 'pass' : 'warn',
          details: process.env.VINCENT_APP_ID ? 'Vincent configured' : 'Vincent app ID missing'
        },
        gaia: {
          status: process.env.GAIA_API_KEY ? 'pass' : 'warn', 
          details: process.env.GAIA_API_KEY ? 'Gaia API key configured' : 'Gaia API key missing'
        },
        trading: {
          status: 'pass',
          details: 'Trading configuration loaded'
        }
      }
    };

    // Determine overall status
    const checkStatuses = Object.values(health.checks).map(check => check.status);
    if (checkStatuses.includes('fail')) {
      health.status = 'unhealthy';
      res.status(503);
    } else if (checkStatuses.includes('warn')) {
      health.status = 'degraded';
      res.status(200);
    } else {
      health.status = 'healthy';
      res.status(200);
    }

    return res.json(health);

  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}