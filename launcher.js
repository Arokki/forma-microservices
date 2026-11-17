import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const files = ['services/catalog.js', 'services/notifications.js', 'services/orders.js', 'gateway.js'];
const children = files.map(file => spawn(process.execPath, [path.join(root, file)], { cwd: root, env: process.env, stdio: 'inherit' }));
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  for (const child of children) if (child.exitCode === null) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', code => { if (!closing && code !== 0) { stop(); process.exitCode = code || 1; } });
console.log(`MicroShop: http://127.0.0.1:${process.env.GATEWAY_PORT || 4100}`);
