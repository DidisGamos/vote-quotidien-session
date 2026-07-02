/* =========================================================================
   API publique — /api/me
   -------------------------------------------------------------------------
   - GET    : renvoie l'identifiant du votant connecté (ou null).
   - DELETE : déconnecte le votant (efface le cookie de session).
========================================================================= */

import { getVoterId, buildClearVoterCookie } from "../lib/auth.js";
import { findUser } from "../lib/store.js";

function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const userId = getVoterId(req);
    if (!userId) return sendJson(res, 200, { user: null });
    const user = await findUser(userId);
    if (!user) return sendJson(res, 200, { user: null });
    return sendJson(res, 200, { user });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", buildClearVoterCookie(req));
    return sendJson(res, 200, { success: true });
  }

  return sendJson(res, 405, { error: "Méthode non supportée" });
}
