import fs from 'node:fs';
import path from 'node:path';

const root = process.env.DATA_DIR || path.resolve('data');
export function read(name, initial) {
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, `${name}.json`);
  if (!fs.existsSync(file)) write(name, initial);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function write(name, value) {
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, `${name}.json`);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
