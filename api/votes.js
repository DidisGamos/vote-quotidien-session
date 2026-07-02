/* =========================================================================
   API publique — /api/votes
   -------------------------------------------------------------------------
   - GET  : renvoie les données du jour courant UNIQUEMENT pour le votant
            connecté (pas les votes des autres utilisateurs).
   - POST : enregistre un vote (+ commentaire optionnel) pour aujourd'hui,
            rattaché à l'identifiant du votant connecté. Un seul vote par
            volet et par jour et par identifiant.
========================================================================= */

import {
  readAllData,
  addVote,
  todayStr,
  filterDataForDate,
  hasVoted,
  CATEGORIES,
  AlreadyVotedError,
} from "../lib/store.js";
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
    const date = todayStr();

    // Si pas d'utilisateur connecté, renvoyer des données vides
    if (!userId) {
      const emptyData = {};
      for (const category of CATEGORIES) {
        emptyData[category] = {};
      }
      return sendJson(res, 200, {
        ...filterDataForDate(emptyData, date),
        __voter: { userId: null, votedToday: {} },
      });
    }

    // Récupérer UNIQUEMENT les votes de l'utilisateur connecté
    const { data } = await readAllData({ userId });

    let votedToday = {};
    for (const category of CATEGORIES) {
      votedToday[category] = await hasVoted(userId, category, date);
    }

    return sendJson(res, 200, {
      ...filterDataForDate(data, date),
      __voter: { userId, votedToday },
    });
  }

  if (req.method === "POST") {
    if (!userId) {
      return sendJson(res, 401, {
        error:
          "Veuillez vous identifier avec votre identifiant avant de voter.",
      });
    }

    const body = await readJsonBody(req);
    if (body === null) return sendJson(res, 400, { error: "JSON invalide" });

    const { category, value, date, comment } = body;
    const numValue = Number(value);
    const isValidDate =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);

    if (
      !CATEGORIES.includes(category) ||
      ![1, 2, 3, 4, 5].includes(numValue) ||
      !isValidDate
    ) {
      return sendJson(res, 400, { error: "Requête invalide" });
    }

    try {
      const updated = await addVote({
        user_id: userId,
        category,
        value: numValue,
        date,
        comment,
      });
      // Après avoir voté, renvoyer UNIQUEMENT les votes de l'utilisateur
      const { data: userData } = await readAllData({ userId });
      return sendJson(res, 200, {
        success: true,
        data: filterDataForDate(userData, todayStr()),
      });
    } catch (err) {
      if (err instanceof AlreadyVotedError) {
        return sendJson(res, 409, {
          error: "Vous avez déjà voté pour ce volet aujourd'hui.",
        });
      }
      return sendJson(res, 500, { error: "Erreur serveur, réessayez." });
    }
  }

  return sendJson(res, 405, { error: "Méthode non supportée" });
}
