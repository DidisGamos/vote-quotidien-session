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

// Netlify Blobs n'a AUCUN mécanisme de concurrence intégré : si deux
// écritures se chevauchent sur la même clé, la dernière écrase entièrement
// la précédente ("last write wins" — voir doc officielle). Comme chaque
// vote fait un cycle lire → modifier → écrire sur le même fichier JSON
// partagé, plusieurs votes envoyés à quelques millisecondes d'intervalle
// (ex. les 4 catégories votées à la suite) pouvaient se marcher dessus et
// faire disparaître les votes précédents.
//
// On corrige ça avec un verrouillage optimiste basé sur l'ETag : on lit la
// donnée + son ETag, on modifie, puis on écrit avec onlyIfMatch (ou
// onlyIfNew si la clé n'existe pas encore). Si quelqu'un d'autre a écrit
// entre-temps, l'écriture échoue proprement (modified: false) et on
// recommence le cycle avec les données fraîches, jusqu'à ce que ça
// réussisse.
async function writeWithRetry(store, mutate, maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await store.getWithMetadata(KEY, { type: "json" });
    const data = (current && current.data) || {};
    const etag = current ? current.etag : null;

    const nextData = mutate(data);

    const writeOptions = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const { modified } = await store.set(
      KEY,
      JSON.stringify(nextData),
      writeOptions,
    );

    if (modified) return nextData;

    // Conflit : une autre requête a écrit entre notre lecture et notre
    // écriture. On réessaie avec un léger délai aléatoire pour éviter que
    // plusieurs tentatives ne se re-percutent en boucle.
    await new Promise((resolve) =>
      setTimeout(resolve, 30 + Math.random() * 70),
    );
  }
  throw new Error(
    "Impossible d'enregistrer après plusieurs tentatives (trop de conflits concurrents).",
  );
}

export default async (req) => {
  // consistency: "strong" force chaque lecture à refléter la toute dernière
  // écriture. Sans cela, Netlify Blobs utilise une cohérence "éventuelle" :
  // deux GET rapprochés peuvent atterrir sur des copies différentes du store
  // et renvoyer des compteurs différents pour la même catégorie — c'est ce
  // qui causait les votes qui "changeaient" ou disparaissaient au
  // rafraîchissement.
  const store = getStore(STORE_NAME, { consistency: "strong" });

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

    let data;
    try {
      data = await writeWithRetry(store, (current) => {
        if (!current[category]) current[category] = {};
        if (!current[category][date]) current[category][date] = emptyDay();

        const day = current[category][date];
        day.counts[String(numValue)] = (day.counts[String(numValue)] || 0) + 1;

        const cleanComment = sanitizeComment(comment);
        if (cleanComment) {
          if (!Array.isArray(day.comments)) day.comments = [];
          day.comments.push({ v: numValue, text: cleanComment });
        }

        return current;
      });
    } catch (err) {
      return jsonResponse(
        {
          error:
            "Trop de votes simultanés, veuillez réessayer dans un instant.",
        },
        503,
      );
    }

    return jsonResponse({ success: true, data });
  }

  return jsonResponse({ error: "Méthode non supportée" }, 405);
};

export const config = {
  path: "/api/votes",
};
