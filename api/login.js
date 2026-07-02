/* =========================================================================
   API publique — /api/login (votants)
   -------------------------------------------------------------------------
   Identification simple par identifiant (ex: U001), sans mot de passe.
   On vérifie juste que l'identifiant a bien été créé par l'admin, puis on
   pose un cookie de session signé.
========================================================================= */

import { findUser, findUserByLabel } from "../lib/store.js";
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
  const raw = typeof id === "string" ? id.trim() : "";

  if (!raw) {
    return sendJson(res, 400, { error: "Identifiant ou étiquette requis" });
  }

  // On se connecte d'abord par l'étiquette (ex: "Table 3"), plus facile à
  // retenir sur le terrain. Si aucune étiquette ne correspond, on retente
  // avec le code technique (ex: U001) pour ne pas casser les identifiants
  // déjà communiqués sans étiquette.
  let user = await findUserByLabel(raw);
  if (!user) {
    user = await findUser(raw.toUpperCase());
  }

  if (!user) {
    return sendJson(res, 401, {
      error:
        "Étiquette ou identifiant inconnu. Vérifiez auprès de l'organisateur.",
    });
  }

  res.setHeader("Set-Cookie", buildVoterSessionCookie(req, user.id));
  return sendJson(res, 200, { success: true, user });
}
