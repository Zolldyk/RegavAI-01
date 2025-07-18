#!/usr/bin/env node

/**
 * IPFS HTTP Proxy for Lit Protocol
 * This proxy serves IPFS content to Lit Protocol nodes
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

const PORT = 8082;
const LOCAL_IPFS_GATEWAY = 'http://127.0.0.1:8081';

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Enable CORS for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, User-Agent, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Parse the request URL
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  
  // Check if it's an IPFS request
  if (requestUrl.pathname.startsWith('/ipfs/')) {
    // Forward to local IPFS gateway
    const ipfsUrl = `${LOCAL_IPFS_GATEWAY}${requestUrl.pathname}${requestUrl.search}`;
    
    console.log(`Forwarding to: ${ipfsUrl}`);
    
    // Create request to local IPFS gateway
    const options = {
      method: req.method,
      headers: {
        ...req.headers,
        host: '127.0.0.1:8081'
      }
    };
    
    const proxyReq = http.request(ipfsUrl, options, (proxyRes) => {
      // Forward response headers
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      
      // Forward response body
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (err) => {
      console.error(`Proxy error: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    });
    
    // Forward request body if any
    req.pipe(proxyReq);
  } else {
    // Return 404 for non-IPFS requests
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🔗 IPFS HTTP Proxy running on http://localhost:${PORT}`);
  console.log(`📡 Forwarding IPFS requests to ${LOCAL_IPFS_GATEWAY}`);
  console.log(`🚀 Ready to serve IPFS content to Lit Protocol nodes`);
});

server.on('error', (err) => {
  console.error(`Server error: ${err.message}`);
});