/* =========================================================================
   API admin — /api/admin/users (authentification requise)
   -------------------------------------------------------------------------
   - GET  : liste tous les identifiants votants créés (U001, U002...).
   - POST : crée un nouvel identifiant, généré automatiquement en série.
========================================================================= */

import { listUsers, createUser } from "../../lib/store.js";
import { isAuthenticated } from "../../lib/auth.js";

function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

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

export default async function handler(req, res) {
  if (!isAuthenticated(req)) {
    return sendJson(res, 401, { error: "Non authentifié" });
  }

  if (req.method === "GET") {
    const users = await listUsers();
    return sendJson(res, 200, { users });
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
    const user = await createUser(label || null);
    return sendJson(res, 200, { success: true, user });
  }

  return sendJson(res, 405, { error: "Méthode non supportée" });
}
