const $ = selector => document.querySelector(selector);
const state = { products: [], category: 'Все товары', query: '', cart: loadCart(), view: 'cart' };
const money = value => `${Number(value).toLocaleString('ru-RU')} BYN`;
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let toastTimer;

function loadCart() {
  try { const value = JSON.parse(localStorage.getItem('forma-cart') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}
function saveCart() { localStorage.setItem('forma-cart', JSON.stringify(state.cart)); }
function cartEntries() { return state.products.filter(p => state.cart[p.id] > 0).map(p => ({ product: p, quantity: Math.min(state.cart[p.id], p.stock) })).filter(item => item.quantity > 0); }
function cartTotal() { return cartEntries().reduce((sum, item) => sum + item.product.price * item.quantity, 0); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2900); }

async function getProducts() {
  const response = await fetch('/api/products');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить каталог');
  state.products = data.products;
  for (const product of state.products) if (state.cart[product.id] > product.stock) state.cart[product.id] = product.stock;
  saveCart(); renderFilters(); renderProducts(); renderCart();
}
function renderFilters() {
  const categories = ['Все товары', ...new Set(state.products.map(p => p.category))];
  $('#category-filters').innerHTML = categories.map(category => `<button type="button" data-category="${safe(category)}" class="${state.category === category ? 'active' : ''}">${safe(category)}</button>`).join('');
}
function renderProducts() {
  const query = state.query.toLocaleLowerCase('ru-RU');
  const products = state.products.filter(p => (state.category === 'Все товары' || p.category === state.category) && `${p.name} ${p.category} ${p.description || ''}`.toLocaleLowerCase('ru-RU').includes(query));
  $('#result-count').textContent = `${products.length} товаров`;
  $('#products').innerHTML = products.length ? products.map(p => `<article class="product-card"><div class="product-art ${safe(p.color)}"><span class="tag">${p.stock > 0 ? 'В наличии' : 'Нет в наличии'}</span><span class="symbol" aria-hidden="true">${safe(p.icon)}</span></div><div class="product-info"><small>${safe(p.category)}</small><h3>${safe(p.name)}</h3><p>${safe(p.description || '')}</p><div class="product-foot"><strong>${money(p.price)}</strong><button type="button" data-add="${safe(p.id)}" ${p.stock === 0 ? 'disabled' : ''}>Добавить в корзину</button></div></div></article>`).join('') : '<div class="no-products">По вашему запросу товары не найдены.</div>';
}
function renderCart() {
  const entries = cartEntries();
  const count = entries.reduce((sum, item) => sum + item.quantity, 0);
  $('#cart-count').textContent = count;
  $('#cart-items').innerHTML = entries.length ? entries.map(({ product: p, quantity }) => `<div class="cart-item"><div class="cart-thumb ${safe(p.color)}" aria-hidden="true">${safe(p.icon)}</div><div class="cart-item-info"><strong>${safe(p.name)}</strong><small>${safe(p.category)}</small><div class="cart-item-controls"><button type="button" data-decrease="${safe(p.id)}" aria-label="Уменьшить количество ${safe(p.name)}">−</button><span>${quantity}</span><button type="button" data-increase="${safe(p.id)}" aria-label="Увеличить количество ${safe(p.name)}" ${quantity >= p.stock ? 'disabled' : ''}>+</button></div></div><div class="cart-price">${money(p.price * quantity)}</div></div>`).join('') : '<div class="empty-cart"><span>◇</span><h3>В корзине пока пусто</h3><p>Добавьте понравившиеся товары из каталога, и они появятся здесь.</p></div>';
  $('#cart-total').textContent = money(cartTotal());
  $('#checkout-total').textContent = money(cartTotal());
  $('#checkout-open').disabled = count === 0;
}
function changeQuantity(id, difference) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  const next = Math.max(0, Math.min(product.stock, (state.cart[id] || 0) + difference));
  if (next) state.cart[id] = next; else delete state.cart[id];
  saveCart(); renderCart();
}
function openDrawer(view = 'cart') {
  state.view = view;
  $('#cart-view').hidden = view !== 'cart';
  $('#checkout-view').hidden = view !== 'checkout';
  $('#drawer-title').textContent = view === 'cart' ? 'Корзина' : 'Оформление заказа';
  $('#overlay').hidden = false;
  $('#cart-drawer').classList.add('open');
  $('#cart-drawer').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  $('#cart-drawer').classList.remove('open');
  $('#cart-drawer').setAttribute('aria-hidden', 'true');
  if ($('#confirmation').hidden) { $('#overlay').hidden = true; document.body.style.overflow = ''; }
}
function closeConfirmation() { $('#confirmation').hidden = true; $('#overlay').hidden = true; document.body.style.overflow = ''; }

$('#category-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-category]'); if (!button) return;
  state.category = button.dataset.category; renderFilters(); renderProducts();
});
$('#products').addEventListener('click', event => {
  const id = event.target.closest('[data-add]')?.dataset.add; if (!id) return;
  const product = state.products.find(p => p.id === id);
  if (!product || (state.cart[id] || 0) >= product.stock) return toast('Достигнут доступный остаток');
  changeQuantity(id, 1); toast('Товар добавлен в корзину');
});
$('#cart-items').addEventListener('click', event => {
  const increase = event.target.closest('[data-increase]');
  const decrease = event.target.closest('[data-decrease]');
  if (increase) changeQuantity(increase.dataset.increase, 1);
  if (decrease) changeQuantity(decrease.dataset.decrease, -1);
});
$('#cart-toggle').addEventListener('click', () => openDrawer());
$('#cart-close').addEventListener('click', closeDrawer);
$('#overlay').addEventListener('click', () => { if (!$('#confirmation').hidden) closeConfirmation(); else closeDrawer(); });
$('#checkout-open').addEventListener('click', () => { if (cartEntries().length) openDrawer('checkout'); });
$('#checkout-back').addEventListener('click', () => openDrawer());
$('#search-toggle').addEventListener('click', () => { $('#search-panel').hidden = false; $('#search-input').focus(); });
$('#search-close').addEventListener('click', () => { $('#search-panel').hidden = true; $('#search-input').value = ''; state.query = ''; renderProducts(); });
$('#search-input').addEventListener('input', event => { state.query = event.target.value.trim(); renderProducts(); });
$('#checkout-form').addEventListener('submit', async event => {
  event.preventDefault();
  const entries = cartEntries(); if (!entries.length) return;
  const form = event.currentTarget;
  const fields = form.elements;
  const button = $('#place-order');
  $('#checkout-error').textContent = '';
  button.disabled = true; button.textContent = 'Оформляем…';
  try {
    const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      customer: fields.namedItem('customer').value.trim(), phone: fields.namedItem('phone').value.trim(), email: fields.namedItem('email').value.trim(),
      city: fields.namedItem('city').value.trim(), postalCode: fields.namedItem('postalCode').value.trim(), address: fields.namedItem('address').value.trim(),
      paymentMethod: 'cash_on_delivery', items: entries.map(({ product, quantity }) => ({ id: product.id, quantity }))
    }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось оформить заказ');
    state.cart = {}; saveCart(); renderCart(); form.reset(); closeDrawer();
    $('#confirmed-id').textContent = data.order.id;
    showOrderTrace(data.order);
    $('#confirmation').hidden = false; $('#overlay').hidden = false; document.body.style.overflow = 'hidden';
    getProducts().catch(() => {});
  } catch (error) { $('#checkout-error').textContent = error.message; await getProducts().catch(() => {}); }
  finally { button.disabled = false; button.innerHTML = 'Подтвердить заказ <span>→</span>'; }
});
$('#confirmation-close').addEventListener('click', closeConfirmation);
$('#continue-shopping').addEventListener('click', closeConfirmation);
$('#confirmation-trace').addEventListener('click', closeConfirmation);
document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (!$('#confirmation').hidden) closeConfirmation(); else { closeDrawer(); $('#search-panel').hidden = true; } } });
getProducts().catch(() => { $('#catalog-error').hidden = false; $('#products').hidden = true; });

function showOrderTrace(order) {
  const trace = $('#order-trace');
  const heading = document.createElement('h3');
  heading.textContent = `Заказ #${order.id.slice(0, 8)} · результат обработки`;
  const steps = [
    'API-шлюз принял запрос на оформление',
    'Каталог зарезервировал товары',
    'Сервис заказов сохранил заказ',
    order.notificationStatus === 'recorded'
      ? 'Сервис уведомлений записал событие'
      : 'Запись в сервисе уведомлений не подтверждена'
  ];
  const list = document.createElement('ol');
  for (const step of steps) {
    const item = document.createElement('li');
    item.textContent = step;
    list.append(item);
  }
  trace.replaceChildren(heading, list);
  trace.hidden = false;
  refreshServices();
}

async function refreshServices() {
  const button = $('#refresh-services');
  const summary = $('#service-summary');
  button.disabled = true;
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('Health check failed');
    const { services } = await response.json();
    const statuses = new Map(services.map(service => [service.name, service.status]));
    statuses.set('gateway', 'online');
    for (const badge of document.querySelectorAll('[data-health]')) {
      const online = statuses.get(badge.dataset.health) === 'online';
      badge.dataset.state = online ? 'online' : 'offline';
      badge.textContent = online ? 'В сети' : 'Недоступен';
    }
    const onlineCount = [...statuses.values()].filter(status => status === 'online').length;
    summary.textContent = `В сети: ${onlineCount} из 4 · Проверено в ${new Date().toLocaleTimeString('ru-RU')}`;
  } catch {
    for (const badge of document.querySelectorAll('[data-health]')) {
      delete badge.dataset.state;
      badge.textContent = 'Статус неизвестен';
    }
    summary.textContent = 'Шлюз не ответил на запрос проверки. Попробуйте обновить статусы.';
  } finally {
    button.disabled = false;
  }
}

$('#refresh-services').addEventListener('click', refreshServices);
refreshServices();

const serviceNames = { catalog: 'Каталог', orders: 'Заказы', notifications: 'Уведомления' };
async function updateLab() {
  try {
    const [health, log] = await Promise.all([
      fetch('/api/health').then(response => response.json()),
      fetch('/api/lab').then(response => response.json())
    ]);
    $('#service-controls').replaceChildren(...health.services.map(service => {
      const button = document.createElement('button');
      const online = service.status === 'online';
      button.textContent = serviceNames[service.name] + (online ? ' · Отключить' : ' · Включить');
      button.onclick = async () => {
        button.disabled = true;
        try {
          const response = await fetch('/api/lab', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ service: service.name, enabled: !online })
          });
          if (!response.ok) throw new Error('Не удалось переключить сервис');
          $('#control-message').textContent = serviceNames[service.name] + (online ? ' отключён' : ' включён');
          await refreshServices();
          await updateLab();
        } catch (error) { $('#control-message').textContent = error.message; }
        finally { button.disabled = false; }
      };
      return button;
    }));
    const rows = log.events.map(event => {
      const row = document.createElement('div');
      row.className = 'log-row';
      row.textContent = new Date(event.time).toLocaleTimeString('ru-RU') + ' · ' +
        event.traceId.slice(0, 8) + ' · ' + event.service + ' · ' +
        event.method + ' ' + event.path + ' · ' +
        (event.stage === 'received' ? 'Получен запрос' : 'Ответ ' + event.status);
      if (event.status >= 400) row.classList.add('log-error');
      return row;
    });
    $('#request-log').replaceChildren(...rows);
    if (!rows.length) $('#request-log').textContent = 'Запросов пока нет. Откройте каталог или оформите заказ.';
  } catch {
    $('#control-message').textContent = 'Панель недоступна. Перезапустите приложение, чтобы загрузить изменения сервера.';
  }
}
updateLab();
setInterval(updateLab, 4000);
