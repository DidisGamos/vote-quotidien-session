import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

export default async function handler(req, res) {
  const filePath = join(rootDir, 'index.html');
  try {
    const html = await readFile(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch {
    res.status(404).send('Not Found');
  }
}
