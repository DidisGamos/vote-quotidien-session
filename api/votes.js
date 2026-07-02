/* =========================================================================
   API publique — /api/votes
   -------------------------------------------------------------------------
   - GET  : renvoie les données du jour courant (pas l'historique, réservé à
            l'espace admin), ainsi que les volets déjà votés aujourd'hui par
            le votant identifié (via son cookie de session).
   - POST : enregistre un vote (+ commentaire optionnel) pour aujourd'hui,
            rattaché à l'identifiant du votant connecté. Un seul vote par
            volet et par jour et par identifiant.
========================================================================= */

import { readAllData, addVote, todayStr, filterDataForDate, hasVoted, CATEGORIES, AlreadyVotedError } from "../lib/store.js";
import { getVoterId } from "../lib/auth.js";

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
      return null;
    }
  }
  return req.body || {};
}

export default async function handler(req, res) {
  const userId = getVoterId(req);

  if (req.method === "GET") {
    const { data } = await readAllData();
    const date = todayStr();

    let votedToday = {};
    if (userId) {
      for (const category of CATEGORIES) {
        votedToday[category] = await hasVoted(userId, category, date);
      }
    }

    return sendJson(res, 200, {
      ...filterDataForDate(data, date),
      __voter: { userId, votedToday },
    });
  }

  if (req.method === "POST") {
    if (!userId) {
      return sendJson(res, 401, { error: "Veuillez vous identifier avec votre identifiant avant de voter." });
    }

    const body = await readJsonBody(req);
    if (body === null) return sendJson(res, 400, { error: "JSON invalide" });

    const { category, value, date, comment } = body;
    const numValue = Number(value);
    const isValidDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);

    if (!CATEGORIES.includes(category) || ![1, 2, 3, 4, 5].includes(numValue) || !isValidDate) {
      return sendJson(res, 400, { error: "Requête invalide" });
    }

    try {
      const updated = await addVote({ user_id: userId, category, value: numValue, date, comment });
      return sendJson(res, 200, { success: true, data: filterDataForDate(updated, todayStr()) });
    } catch (err) {
      if (err instanceof AlreadyVotedError) {
        return sendJson(res, 409, { error: "Vous avez déjà voté pour ce volet aujourd'hui." });
      }
      return sendJson(res, 500, { error: "Erreur serveur, réessayez." });
    }
  }

  return sendJson(res, 405, { error: "Méthode non supportée" });
}
