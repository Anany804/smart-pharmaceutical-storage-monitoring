'use strict';

const http = require('node:http');
const path = require('node:path');
require('./load-env').loadEnv(path.join(__dirname, '..', '.env'));
const { createService } = require('./service');

function createHttpServer(service = createService()) {
  return http.createServer((req, res) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 64 * 1024) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      if (tooLarge) {
        res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { code: 'BODY_TOO_LARGE', message: 'Request body exceeds 64 KiB.' } }));
        return;
      }
      let payload;
      if (chunks.length) {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { payload = JSON.parse(raw); } catch {
          const result = { statusCode: 400, body: { error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' } } };
          res.writeHead(result.statusCode, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result.body));
          return;
        }
      }
      const result = service.handle(req.method, req.url, payload, req.headers);
      res.writeHead(result.statusCode, result.headers);
      res.end(JSON.stringify(result.body));
    });
  });
}

if (require.main === module) {
  const service = createService();
  const server = createHttpServer(service);
  const port = Number(process.env.API_PORT || 3000);
  const host = process.env.API_HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Pharmaceutical API listening at http://${host}:${port}`));
  const stop = () => server.close(() => { service.close(); process.exit(0); });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = { createHttpServer };
