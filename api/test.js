// Simple test endpoint
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('x-vercel-protection-bypass', process.env.VERCEL_PROTECTION_BYPASS_SECRET || '');
  
  return res.status(200).json({
    success: true,
    message: 'API is working',
    timestamp: new Date().toISOString(),
    method: req.method,
    query: req.query
  });
}