import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

export default async function handler(req, res) {
  const filePath = join(rootDir, 'style.css');
  try {
    const css = await readFile(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(css);
  } catch {
    res.status(404).send('Not Found');
  }
}
