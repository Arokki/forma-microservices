import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, send, body, request, HttpError } from './lib/http.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const ports = { catalog: process.env.CATALOG_PORT || 4101, orders: process.env.ORDERS_PORT || 4102, notifications: process.env.NOTIFICATIONS_PORT || 4103 };
const routes = { '/api/products': ['catalog', '/products', 'GET'], '/api/orders': ['orders', '/orders', 'POST'] };

serve('gateway', Number(process.env.GATEWAY_PORT || 4100), async (req, res, traceId) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/lab') {
    if (req.method === 'POST') {
      const input = await body(req);
      if (!Object.hasOwn(ports, input.service) || typeof input.enabled !== 'boolean') throw new HttpError(400, 'Некорректная команда');
      await request(`http://127.0.0.1:${ports[input.service]}/_control`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: input.enabled })
      });
      return send(res, 200, { ok: true }, traceId);
    }
    const sources = [Number(process.env.GATEWAY_PORT || 4100), ...Object.values(ports)];
    const results = await Promise.all(sources.map(async port => {
      try { return (await request(`http://127.0.0.1:${port}/_events`)).events; }
      catch { return []; }
    }));
    return send(res, 200, { events: results.flat().sort((a, b) => a.time.localeCompare(b.time)).slice(-60) }, traceId);
  }
  if (pathname === '/api/health') {
    const services = await Promise.all(Object.entries(ports).map(async ([name, port]) => {
      try { await request(`http://127.0.0.1:${port}/health`, { headers: { 'x-trace-id': traceId } }); return { name, status: 'online', port: Number(port) }; }
      catch { return { name, status: 'offline', port: Number(port) }; }
    }));
    return send(res, 200, { gateway: 'online', services, traceId, timestamp: new Date().toISOString() }, traceId);
  }
  if (routes[pathname]) {
    const [service, endpoint, method] = routes[pathname];
    if (req.method !== method) throw new HttpError(405, 'Метод не поддерживается');
    const payload = req.method === 'POST' ? await body(req) : undefined;
    const url = `http://127.0.0.1:${ports[service]}${endpoint}`;
    const data = await request(url, { method: req.method, headers: { 'content-type': 'application/json', 'x-trace-id': traceId }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return send(res, req.method === 'POST' ? 201 : 200, data, traceId);
  }
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!['index.html', 'app.js', 'style.css', 'favicon.svg'].includes(file)) throw new HttpError(404, 'Страница не найдена');
  const content = fs.readFileSync(path.join(root, 'public', file));
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript; charset=utf-8' });
  res.end(content);
});
