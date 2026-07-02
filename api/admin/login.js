import { checkPassword, buildSessionCookie } from "../../lib/auth.js";

async function readJsonBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Méthode non supportée" });
  }

  if (!process.env.ADMIN_PASSWORD) {
    return sendJson(res, 500, {
      error: "ADMIN_PASSWORD n'est pas configuré côté serveur. Ajoutez cette variable d'environnement.",
    });
  }

  const { password } = await readJsonBody(req);

  if (!checkPassword(password)) {
    return sendJson(res, 401, { error: "Mot de passe incorrect" });
  }

  res.setHeader("Set-Cookie", buildSessionCookie(req));
  return sendJson(res, 200, { success: true });
}
