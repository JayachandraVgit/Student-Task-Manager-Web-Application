const express = require('express');
const client = require('prom-client');
const path = require('path');

const app = express();
const PORT = 3000;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const requests = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests received',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const duration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  registers: [register],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const route = req.path === '/metrics' ? '/metrics' :
      (req.path === '/' ? '/' : req.path);

    requests.inc({
      method: req.method,
      route,
      status: String(res.statusCode)
    });

    duration.observe(
      { method: req.method, route },
      Number(process.hrtime.bigint() - start) / 1e9
    );
  });

  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res, next) => {
  res.sendFile(path.join(__dirname, 'index.html'), err => {
    if (err) next(err);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Task Manager monitoring app listening on port ${PORT}`);
});
