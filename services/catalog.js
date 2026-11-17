import { serve, send, body, HttpError } from '../lib/http.js';
import { read, write } from '../lib/store.js';

const port = Number(process.env.CATALOG_PORT || 4101);
const initial = [
  { id: 'p1', name: 'Механическая клавиатура', category: 'Рабочее место', price: 129, stock: 8, icon: '⌨', color: 'violet', description: 'Тактильные клавиши и компактный корпус для комфортной работы.' },
  { id: 'p2', name: 'Настольная лампа', category: 'Освещение', price: 79, stock: 12, icon: '◉', color: 'amber', description: 'Мягкий регулируемый свет для рабочего стола.' },
  { id: 'p3', name: 'Беспроводные наушники', category: 'Аудио', price: 189, stock: 6, icon: '◖', color: 'blue', description: 'Чистый звук и удобная посадка на каждый день.' },
  { id: 'p4', name: 'Термокружка', category: 'Аксессуары', price: 39, stock: 20, icon: '◕', color: 'green', description: 'Сохраняет температуру напитка дома и в дороге.' },
  { id: 'p5', name: 'Подставка для ноутбука', category: 'Рабочее место', price: 69, stock: 10, icon: '▱', color: 'sand', description: 'Поднимает экран на удобную высоту и освобождает стол.' },
  { id: 'p6', name: 'Портативная колонка', category: 'Аудио', price: 119, stock: 9, icon: '◉', color: 'coral', description: 'Компактная колонка с насыщенным звучанием.' },
  { id: 'p7', name: 'Настольный органайзер', category: 'Аксессуары', price: 49, stock: 15, icon: '▦', color: 'mint', description: 'Порядок для мелочей, которые всегда под рукой.' },
  { id: 'p8', name: 'Светильник Ambient', category: 'Освещение', price: 99, stock: 7, icon: '✳', color: 'lilac', description: 'Тёплый акцентный свет для уютного вечера.' }
];

function getProducts() {
  const saved = read('catalog', initial);
  let changed = false;
  for (const product of initial) {
    const existing = saved.find(item => item.id === product.id);
    if (!existing) { saved.push(product); changed = true; }
    else if (!existing.description) { existing.description = product.description; changed = true; }
  }
  if (changed) write('catalog', saved);
  return saved;
}

serve('catalog', port, async (req, res, traceId) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/health' && req.method === 'GET') return send(res, 200, { service: 'catalog', status: 'ok' }, traceId);
  if (path === '/products' && req.method === 'GET') return send(res, 200, { products: getProducts() }, traceId);
  if (path === '/reserve' && req.method === 'POST') {
    const input = await body(req);
    if (!Array.isArray(input.items) || input.items.length === 0) throw new HttpError(400, 'Корзина пуста');
    const products = getProducts();
    const counts = new Map();
    for (const item of input.items) {
      if (typeof item.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)
        throw new HttpError(400, 'Некорректное количество товара');
      counts.set(item.id, (counts.get(item.id) || 0) + item.quantity);
    }
    const reserved = [];
    for (const [id, quantity] of counts) {
      const product = products.find(p => p.id === id);
      if (!product) throw new HttpError(404, `Товар ${id} не найден`);
      if (product.stock < quantity) throw new HttpError(409, `Недостаточно товара: ${product.name}`);
      reserved.push({ id, name: product.name, quantity, price: product.price });
    }
    for (const item of reserved) products.find(p => p.id === item.id).stock -= item.quantity;
    write('catalog', products);
    return send(res, 200, { items: reserved, total: reserved.reduce((n, p) => n + p.quantity * p.price, 0) }, traceId);
  }
  throw new HttpError(404, 'Маршрут не найден');
});
