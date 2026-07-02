import { buildClearCookie } from "../../lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Set-Cookie", buildClearCookie(req));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify({ success: true }));
}
