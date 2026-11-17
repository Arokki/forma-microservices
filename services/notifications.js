import { randomUUID } from 'node:crypto';
import { serve, send, body, HttpError } from '../lib/http.js';
import { read, write } from '../lib/store.js';

const port = Number(process.env.NOTIFICATIONS_PORT || 4103);
serve('notifications', port, async (req, res, traceId) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/health' && req.method === 'GET') return send(res, 200, { service: 'notifications', status: 'ok' }, traceId);
  if (path === '/notifications' && req.method === 'GET') return send(res, 200, { notifications: read('notifications', []) }, traceId);
  if (path === '/notifications' && req.method === 'POST') {
    const input = await body(req);
    if (!input.orderId || !input.email) throw new HttpError(400, 'Нужны заказ и адрес электронной почты');
    const notifications = read('notifications', []);
    const entry = { id: randomUUID(), orderId: input.orderId, email: input.email, message: `Заказ ${input.orderId.slice(0, 8)} принят на сумму ${input.total} BYN`, channel: 'demo-email', status: 'recorded', createdAt: new Date().toISOString(), traceId };
    notifications.unshift(entry);
    write('notifications', notifications);
    return send(res, 201, { notification: entry }, traceId);
  }
  throw new HttpError(404, 'Маршрут не найден');
});
