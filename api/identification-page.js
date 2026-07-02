import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getVoterId } from "../lib/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

export default async function handler(req, res) {
  if (getVoterId(req)) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    res.end();
    return;
  }

  const filePath = join(rootDir, "identification.html");
  try {
    const html = await readFile(filePath, "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch {
    res.status(404).send("Not Found");
  }
}
