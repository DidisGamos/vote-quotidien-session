/* =========================================================================
   API admin — /api/admin/data (authentification requise)
   -------------------------------------------------------------------------
   - GET    : renvoie l'historique complet (tous volets, tous jours).
             Ajouter ?user=U001 pour ne voir que les votes de cet
             identifiant (l'historique reste une seule table de votes,
             simplement filtrée par identifiant).
   - DELETE : réinitialise toutes les données.
========================================================================= */

import { readAllData, resetAll } from "../../lib/store.js";
import { isAuthenticated } from "../../lib/auth.js";

function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (!isAuthenticated(req)) {
    return sendJson(res, 401, { error: "Non authentifié" });
  }

  if (req.method === "GET") {
    const userId = typeof req.query?.user === "string" && req.query.user.trim() ? req.query.user.trim().toUpperCase() : undefined;
    const { data } = await readAllData({ userId });
    return sendJson(res, 200, data || {});
  }

  if (req.method === "DELETE") {
    const cleared = await resetAll();
    return sendJson(res, 200, { success: true, data: cleared });
  }

  return sendJson(res, 405, { error: "Méthode non supportée" });
}
