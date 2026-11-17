import http from 'node:http';
import { randomUUID } from 'node:crypto';

export function send(res, status, payload, traceId) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-trace-id',
    ...(traceId ? { 'x-trace-id': traceId } : {})
  });
  res.end(JSON.stringify(payload));
}

export async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, 'Слишком большой запрос');
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw new HttpError(400, 'Некорректный JSON'); }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function serve(name, port, handler) {
  let enabled = true;
  const events = [];
  const server = http.createServer(async (req, res) => {
    const traceId = req.headers['x-trace-id'] || randomUUID();
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/_control' && req.method === 'POST') {
      const input = await body(req).catch(() => ({}));
      enabled = input.enabled !== false;
      return send(res, 200, { enabled }, traceId);
    }
    if (pathname === '/_events' && req.method === 'GET') return send(res, 200, { events }, traceId);
    const tracked = !['/health', '/api/health', '/api/lab'].includes(pathname) &&
      (name !== 'gateway' || pathname.startsWith('/api/'));
    if (tracked) {
      events.push({ time: new Date().toISOString(), service: name, method: req.method, path: pathname, stage: 'received', traceId });
      res.once('finish', () => {
        events.push({ time: new Date().toISOString(), service: name, method: req.method, path: pathname, stage: 'completed', status: res.statusCode, traceId });
        if (events.length > 200) events.splice(0, events.length - 200);
      });
    }
    if (!enabled) return send(res, 503, { error: 'Сервис отключён в панели управления', service: name, traceId }, traceId);
    if (req.method === 'OPTIONS') return send(res, 204, {}, traceId);
    try { await handler(req, res, traceId); }
    catch (error) {
      if (!error.status || error.status >= 500) console.error(`[${name}] ${traceId}`, error);
      send(res, error.status || 500, { error: error.status ? error.message : 'Внутренняя ошибка', service: name, traceId }, traceId);
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`[${name}] http://127.0.0.1:${port}`));
}

export async function request(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    if (!response.ok) throw new HttpError(response.status, data.error || `Ошибка сервиса: ${response.status}`);
    return data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, `Сервис недоступен: ${new URL(url).port}`);
  }
}
