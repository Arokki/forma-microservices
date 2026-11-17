import { randomUUID } from 'node:crypto';
import { serve, send, body, request, HttpError } from '../lib/http.js';
import { read, write } from '../lib/store.js';

const port = Number(process.env.ORDERS_PORT || 4102);
const catalog = `http://127.0.0.1:${process.env.CATALOG_PORT || 4101}`;
const notifications = `http://127.0.0.1:${process.env.NOTIFICATIONS_PORT || 4103}`;

serve('orders', port, async (req, res, traceId) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/health' && req.method === 'GET') return send(res, 200, { service: 'orders', status: 'ok' }, traceId);
  if (path === '/orders' && req.method === 'GET') return send(res, 200, { orders: read('orders', []) }, traceId);
  if (path === '/orders' && req.method === 'POST') {
    const input = await body(req);
    if (typeof input.customer !== 'string' || input.customer.trim().length < 2 || input.customer.length > 80)
      throw new HttpError(400, 'Укажите имя покупателя');
    if (typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 120)
      throw new HttpError(400, 'Укажите корректный email');
    if (typeof input.phone !== 'string' || !/^\+?[0-9()\s-]{7,22}$/.test(input.phone))
      throw new HttpError(400, 'Укажите корректный номер телефона');
    if (typeof input.city !== 'string' || input.city.trim().length < 2 || input.city.length > 80)
      throw new HttpError(400, 'Укажите город доставки');
    if (typeof input.address !== 'string' || input.address.trim().length < 5 || input.address.length > 200)
      throw new HttpError(400, 'Укажите адрес доставки');
    if (input.postalCode && (typeof input.postalCode !== 'string' || !/^[0-9A-Za-z\s-]{3,12}$/.test(input.postalCode)))
      throw new HttpError(400, 'Укажите корректный почтовый индекс');
    if (input.paymentMethod !== 'cash_on_delivery')
      throw new HttpError(400, 'Выберите доступный способ оплаты');
    const reserved = await request(`${catalog}/reserve`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-trace-id': traceId }, body: JSON.stringify({ items: input.items }) });
    const order = { id: randomUUID(), customer: input.customer.trim(), email: input.email.trim(), phone: input.phone.trim(), city: input.city.trim(), address: input.address.trim(), postalCode: input.postalCode?.trim() || '', paymentMethod: input.paymentMethod, items: reserved.items, total: reserved.total, status: 'accepted', notificationStatus: 'pending', createdAt: new Date().toISOString(), traceId };
    const orders = read('orders', []);
    orders.unshift(order);
    write('orders', orders);
    try {
      await request(`${notifications}/notifications`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-trace-id': traceId }, body: JSON.stringify({ orderId: order.id, email: order.email, total: order.total }) });
      order.notificationStatus = 'recorded';
    } catch { order.notificationStatus = 'failed'; }
    write('orders', orders);
    return send(res, 201, { order }, traceId);
  }
  throw new HttpError(404, 'Маршрут не найден');
});
