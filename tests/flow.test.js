import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('заказ проходит через независимые сервисы', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'microshop-test-'));
  const basePort = 4200 + Math.floor(Math.random() * 1000) * 4;
  const child = spawn(process.execPath, ['launcher.js'], { cwd: root, env: { ...process.env, DATA_DIR: dataDir, GATEWAY_PORT: String(basePort), CATALOG_PORT: String(basePort + 1), ORDERS_PORT: String(basePort + 2), NOTIFICATIONS_PORT: String(basePort + 3) }, stdio: 'ignore' });
  const api = async (endpoint, options) => {
    const response = await fetch(`http://127.0.0.1:${basePort}/api/${endpoint}`, options);
    return { status: response.status, data: await response.json() };
  };
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try { const result = await api('health'); if (result.data.services.every(s => s.status === 'online')) { ready = true; break; } } catch {}
    }
    assert.equal(ready, true, 'все сервисы запущены');
    const page = await fetch(`http://127.0.0.1:${basePort}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /FORMA/);
    const before = await api('products');
    assert.equal(before.data.products[0].stock, 8);
    assert.equal(before.data.products.length, 8);
    const details = { customer: 'Анна', email: 'anna@example.com', phone: '+375291234567', city: 'Минск', address: 'ул. Ленина, 10', paymentMethod: 'cash_on_delivery' };
    const created = await api('orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...details, items: [{ id: 'p1', quantity: 2 }] }) });
    assert.equal(created.status, 201);
    assert.equal(created.data.order.total, 258);
    assert.equal(created.data.order.notificationStatus, 'recorded');
    assert.ok(created.data.order.traceId);
    const [products, ordersResponse, notificationsResponse] = await Promise.all([
      api('products'), fetch(`http://127.0.0.1:${basePort + 2}/orders`), fetch(`http://127.0.0.1:${basePort + 3}/notifications`)
    ]);
    const orders = await ordersResponse.json();
    const notifications = await notificationsResponse.json();
    assert.equal(products.data.products[0].stock, 6);
    assert.equal(orders.orders[0].id, created.data.order.id);
    assert.equal(orders.orders[0].address, details.address);
    assert.equal(notifications.notifications[0].orderId, created.data.order.id);
    assert.equal(notifications.notifications[0].traceId, created.data.order.traceId);
    assert.equal((await api('orders')).status, 405);
    assert.equal((await api('notifications')).status, 404);
    const invalid = await api('orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...details, items: [{ id: 'p1', quantity: 99 }] }) });
    assert.equal(invalid.status, 409);
    assert.equal((await (await fetch(`http://127.0.0.1:${basePort + 2}/orders`)).json()).orders.length, 1);
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
