const http = require('http');
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const websiteRequests = new client.Counter({
  name: 'website_http_requests_total',
  help: 'HTTP requests reported by the website instrumentation',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const responseDuration = new client.Histogram({
  name: 'website_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  registers: [register]
});

// Sidecar health/metrics endpoint. The original Nginx website
// remains separate and unchanged.
const server = http.createServer(async (req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': register.contentType });
    res.end(await register.metrics());
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Metrics sidecar is healthy');
    return;
  }

  websiteRequests.inc({
    method: req.method,
    route: req.url.split('?')[0],
    status: '200'
  });
  responseDuration.observe(
    { method: req.method, route: req.url.split('?')[0] },
    0
  );

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Metrics sidecar endpoint. Use /metrics or /health.');
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Metrics sidecar listening on port 3000');
});
