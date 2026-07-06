/* =========================================================================
   API admin — /api/admin/archived (authentification requise)
   -------------------------------------------------------------------------
   - GET : renvoie la liste des votes archivés (les votes supprimés via
     la réactivation admin). Stockage fallback (fichier/blobs) uniquement.
*/

import { readArchived } from "../../lib/store.js";
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
    try {
      const archived = await readArchived();
      return sendJson(res, 200, { archived });
    } catch (err) {
      return sendJson(res, 500, { error: "Erreur serveur" });
    }
  }

  return sendJson(res, 405, { error: "Méthode non supportée" });
}
