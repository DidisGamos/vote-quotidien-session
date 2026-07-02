/* =========================================================================
   API publique — /api/login (votants)
   -------------------------------------------------------------------------
   Identification simple par identifiant (ex: U001), sans mot de passe.
   On vérifie juste que l'identifiant a bien été créé par l'admin, puis on
   pose un cookie de session signé.
========================================================================= */

import { findUser } from "../lib/store.js";
import { buildVoterSessionCookie } from "../lib/auth.js";

function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
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
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Méthode non supportée" });
  }

  const { id } = await readJsonBody(req);
  const userId = typeof id === "string" ? id.trim().toUpperCase() : "";

  if (!userId) {
    return sendJson(res, 400, { error: "Identifiant requis" });
  }

  const user = await findUser(userId);
  if (!user) {
    return sendJson(res, 401, { error: "Identifiant inconnu. Vérifiez auprès de l'organisateur." });
  }

  res.setHeader("Set-Cookie", buildVoterSessionCookie(req, user.id));
  return sendJson(res, 200, { success: true, user });
}
