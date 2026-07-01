// netlify/functions/votes.js
//
// API minimale pour stocker/lire les votes (et commentaires) dans un unique
// fichier JSON partagé entre tous les visiteurs, via Netlify Blobs
// (persistant, sans base de données à gérer). Aucune donnée d'identité
// n'est enregistrée : uniquement des compteurs { "1":n, ..., "5":n } et une
// liste de commentaires libres, par catégorie et par jour (AAAA-MM-JJ).
//
// GET  /api/votes
//   -> { categorie: { date: { counts: {1..5}, comments: [{v,text}] } } }
//
// POST /api/votes  { category, value, date, comment? }
//   -> incrémente le compteur du jour, ajoute le commentaire s'il est fourni,
//      et renvoie le JSON à jour.

import { getStore } from "@netlify/blobs";

const CATEGORIES = ["sakafo", "logistique", "animation", "formateur"];
const STORE_NAME = "vote-app";
const KEY = "votes-data";
const COMMENT_MAX = 300;

function emptyDay() {
  return { counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, comments: [] };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// Nettoie une chaîne de commentaire : coupe à COMMENT_MAX caractères et
// retire les caractères de contrôle. Le HTML est échappé côté front
// (textContent) à l'affichage, jamais interprété.
function sanitizeComment(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, COMMENT_MAX);
}

export default async (req) => {
  const store = getStore(STORE_NAME);

  if (req.method === "GET") {
    const data = (await store.get(KEY, { type: "json" })) || {};
    return jsonResponse(data);
  }

  if (req.method === "DELETE") {
    // Écrit un objet vide, puis relit immédiatement pour confirmer que le
    // store a bien persisté la suppression avant de répondre.
    await store.set(KEY, JSON.stringify({}));
    const verify = await store.get(KEY, { type: "json" });
    const cleared =
      verify && typeof verify === "object" && Object.keys(verify).length === 0;
    if (!cleared) {
      return jsonResponse(
        {
          success: false,
          error:
            "La réinitialisation n'a pas pu être confirmée par le stockage.",
          data: verify || {},
        },
        500,
      );
    }
    return jsonResponse({ success: true, data: {} });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "JSON invalide" }, 400);
    }

    const { category, value, date, comment } = body || {};
    const numValue = Number(value);
    const isValidDate =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);

    if (
      !CATEGORIES.includes(category) ||
      ![1, 2, 3, 4, 5].includes(numValue) ||
      !isValidDate
    ) {
      return jsonResponse({ error: "Requête invalide" }, 400);
    }

    const data = (await store.get(KEY, { type: "json" })) || {};
    if (!data[category]) data[category] = {};
    if (!data[category][date]) data[category][date] = emptyDay();

    const day = data[category][date];
    day.counts[String(numValue)] = (day.counts[String(numValue)] || 0) + 1;

    const cleanComment = sanitizeComment(comment);
    if (cleanComment) {
      if (!Array.isArray(day.comments)) day.comments = [];
      day.comments.push({ v: numValue, text: cleanComment });
    }

    await store.set(KEY, JSON.stringify(data));

    return jsonResponse({ success: true, data });
  }

  return jsonResponse({ error: "Méthode non supportée" }, 405);
};

export const config = {
  path: "/api/votes",
};
