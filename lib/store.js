/* =========================================================================
   Couche d'accès aux données des votes.
   -------------------------------------------------------------------------
   Un seul backend "base de données" (Supabase, via le client JS ou une
   connexion Postgres brute en repli) et un repli fichier/mémoire pour le
   développement local sans base configurée.

   Modèle : une seule table `votes` pour tout le monde, avec une colonne
   `user_id` qui référence la table `users` (identifiants créés par
   l'admin, ex: U001, U002...). Les votants "anonymes" se connectent
   désormais avec leur identifiant avant de voter, ce qui permet de
   filtrer/tracer l'historique par personne sans dupliquer de table.
========================================================================= */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

export const CATEGORIES = ["sakafo", "logistique", "animation", "formateur"];

const COMMENT_MAX = 300;
const DATA_KEY = "votes-data";
const FALLBACK_FILE = process.env.VOTES_DATA_FILE || "/tmp/vote-app-data.json";
const MEMORY_CACHE = globalThis.__voteAppDataCache || (globalThis.__voteAppDataCache = {});

let supabaseClient = null;
let pgPool = null;

/* --------------------------- Utilitaires --------------------------- */

export function emptyDay() {
  return { counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, comments: [] };
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sanitizeComment(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, COMMENT_MAX);
}

/**
 * Ne garde, pour chaque catégorie, que les données d'une seule date.
 * Utilisé pour ne renvoyer à la page publique que le jour courant (jamais
 * l'historique complet, qui reste réservé à l'espace admin authentifié).
 */
export function filterDataForDate(data, date) {
  const result = {};
  for (const category of CATEGORIES) {
    const day = data?.[category]?.[date];
    result[category] = { [date]: day || emptyDay() };
  }
  return result;
}

/** Génère le prochain identifiant utilisateur en série : U001, U002, ... */
export function nextUserId(existingIds = []) {
  let max = 0;
  for (const id of existingIds) {
    const match = /^U(\d+)$/.exec(String(id).trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `U${String(max + 1).padStart(3, "0")}`;
}

/* --------------------------- Repli fichier/mémoire --------------------------- */

function resolveFallbackPath() {
  return resolve(FALLBACK_FILE);
}

function emptyFallbackData() {
  return { votes: [], users: [] };
}

async function readFallbackFile() {
  try {
    const raw = await readFile(resolveFallbackPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyFallbackData();
    return {
      votes: Array.isArray(parsed.votes) ? parsed.votes : [],
      users: Array.isArray(parsed.users) ? parsed.users : [],
    };
  } catch {
    return emptyFallbackData();
  }
}

async function writeFallbackFile(data) {
  const filePath = resolveFallbackPath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data), "utf8");
}

/* --------------------------- Backend base de données --------------------------- */

function hasDatabaseConfig() {
  return Boolean(
    process.env.SUPABASE_URL ||
      process.env.SUPABASE_CONNECTION_STRING ||
      process.env.DATABASE_URL,
  );
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

function getPgPool() {
  if (pgPool) return pgPool;
  const connString = process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!connString) return null;
  pgPool = new pg.Pool({
    connectionString: connString,
    ssl: connString.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
  return pgPool;
}

function buildStateFromRows(rows = []) {
  const state = {};
  for (const row of rows) {
    const { category, date } = row;
    if (!state[category]) state[category] = {};
    if (!state[category][date]) state[category][date] = emptyDay();

    const day = state[category][date];
    const value = Number(row.value);
    day.counts[String(value)] = (day.counts[String(value)] || 0) + 1;

    const comment = sanitizeComment(row.comment);
    if (comment) day.comments.push({ v: value, text: comment, user_id: row.user_id || null });
  }
  return state;
}

/* ---- Lecture / écriture des votes (table unique, filtrable par user_id) ---- */

async function readDatabaseRows({ userId } = {}) {
  const client = getSupabaseClient();
  if (client) {
    let query = client
      .from("votes")
      .select("id, user_id, category, value, date, comment, created_at")
      .order("created_at", { ascending: true });
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (!error) return data || [];
  }

  const pool = getPgPool();
  if (!pool) throw new Error("Aucune base de données configurée");

  if (userId) {
    const { rows } = await pool.query(
      "SELECT id, user_id, category, value, date, comment, created_at FROM votes WHERE user_id = $1 ORDER BY created_at ASC",
      [userId],
    );
    return rows || [];
  }
  const { rows } = await pool.query(
    "SELECT id, user_id, category, value, date, comment, created_at FROM votes ORDER BY created_at ASC",
  );
  return rows || [];
}

async function databaseHasVoted(userId, category, date) {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("votes")
      .select("id")
      .eq("user_id", userId)
      .eq("category", category)
      .eq("date", date)
      .limit(1);
    if (!error) return (data || []).length > 0;
  }

  const pool = getPgPool();
  if (!pool) throw new Error("Aucune base de données configurée");
  const { rows } = await pool.query(
    "SELECT id FROM votes WHERE user_id = $1 AND category = $2 AND date = $3 LIMIT 1",
    [userId, category, date],
  );
  return rows.length > 0;
}

async function writeDatabaseVote(payload) {
  const client = getSupabaseClient();
  if (client) {
    const { error } = await client.from("votes").insert({
      user_id: payload.user_id || null,
      category: payload.category,
      value: payload.value,
      date: payload.date,
      comment: sanitizeComment(payload.comment) || null,
    });
    if (!error) return;
    if (error.code === "23505") throw new AlreadyVotedError();
    throw new Error(error.message || "Erreur base de données");
  }

  const pool = getPgPool();
  if (!pool) throw new Error("Aucune base de données configurée");

  try {
    await pool.query(
      "INSERT INTO votes (user_id, category, value, date, comment) VALUES ($1, $2, $3, $4, $5)",
      [payload.user_id || null, payload.category, payload.value, payload.date, sanitizeComment(payload.comment) || null],
    );
  } catch (err) {
    if (err && err.code === "23505") throw new AlreadyVotedError();
    throw err;
  }
}

async function resetDatabaseData() {
  const client = getSupabaseClient();
  if (client) {
    const { error } = await client.from("votes").delete().gte("created_at", "1900-01-01T00:00:00+00:00");
    if (!error) return;
  }

  const pool = getPgPool();
  if (!pool) throw new Error("Aucune base de données configurée");

  await pool.query("DELETE FROM votes");
}

/* ---- Utilisateurs (identifiants créés par l'admin) ---- */

async function readDatabaseUsers() {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client.from("users").select("id, label, created_at").order("id", { ascending: true });
    if (!error) return data || [];
  }

  const pool = getPgPool();
  if (!pool) throw new Error("Aucune base de données configurée");
  const { rows } = await pool.query("SELECT id, label, created_at FROM users ORDER BY id ASC");
  return rows || [];
}

async function insertDatabaseUser(id, label) {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("users")
      .insert({ id, label: label || null })
      .select("id, label, created_at")
      .single();
    if (!error) return data;
    throw new Error(error.message || "Erreur base de données");
  }

  const pool = getPgPool();
  if (!pool) throw new Error("Aucune base de données configurée");
  const { rows } = await pool.query(
    "INSERT INTO users (id, label) VALUES ($1, $2) RETURNING id, label, created_at",
    [id, label || null],
  );
  return rows[0];
}

async function findDatabaseUser(id) {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client.from("users").select("id, label, created_at").eq("id", id).maybeSingle();
    if (!error) return data || null;
  }

  const pool = getPgPool();
  if (!pool) throw new Error("Aucune base de données configurée");
  const { rows } = await pool.query("SELECT id, label, created_at FROM users WHERE id = $1", [id]);
  return rows[0] || null;
}

/* --------------------------- Erreurs --------------------------- */

export class AlreadyVotedError extends Error {
  constructor() {
    super("Un vote a déjà été enregistré pour ce volet aujourd'hui avec cet identifiant.");
    this.code = "ALREADY_VOTED";
  }
}

/* --------------------------- API publique du module --------------------------- */

function backendMode() {
  return hasDatabaseConfig() ? "database" : "file";
}

/**
 * Lit l'intégralité des votes (agrégés par catégorie/jour), tous volets,
 * tous jours. Optionnellement filtrés sur un seul utilisateur.
 */
export async function readAllData({ userId } = {}) {
  const backend = backendMode();

  if (backend === "database") {
    try {
      const rows = await readDatabaseRows({ userId });
      const data = buildStateFromRows(rows);
      if (!userId) MEMORY_CACHE[DATA_KEY] = data;
      return { backend, data };
    } catch {
      // Bascule sur le repli fichier/mémoire ci-dessous en cas d'échec.
    }
  }

  const fallback = MEMORY_CACHE.__fallback || (MEMORY_CACHE.__fallback = await readFallbackFile());
  const rows = userId ? fallback.votes.filter((r) => r.user_id === userId) : fallback.votes;
  return { backend: "file", data: buildStateFromRows(rows) };
}

/** Ajoute un vote pour un utilisateur identifié. Rejette les doublons volet/jour/utilisateur. */
export async function addVote(payload) {
  const backend = backendMode();

  if (backend === "database") {
    try {
      await writeDatabaseVote(payload);
      const { data } = await readAllData();
      return data;
    } catch (err) {
      if (err instanceof AlreadyVotedError) throw err;
      // Bascule sur le repli fichier/mémoire ci-dessous en cas d'échec.
    }
  }

  const fallback = MEMORY_CACHE.__fallback || (MEMORY_CACHE.__fallback = await readFallbackFile());

  if (payload.user_id) {
    const dup = fallback.votes.find(
      (r) => r.user_id === payload.user_id && r.category === payload.category && r.date === payload.date,
    );
    if (dup) throw new AlreadyVotedError();
  }

  fallback.votes.push({
    id: fallback.votes.length + 1,
    user_id: payload.user_id || null,
    category: payload.category,
    value: payload.value,
    date: payload.date,
    comment: sanitizeComment(payload.comment) || null,
    created_at: new Date().toISOString(),
  });

  await writeFallbackFile(fallback);
  return buildStateFromRows(fallback.votes);
}

export async function hasVoted(userId, category, date) {
  if (!userId) return false;
  const backend = backendMode();

  if (backend === "database") {
    try {
      return await databaseHasVoted(userId, category, date);
    } catch {
      // Bascule sur le repli fichier/mémoire ci-dessous en cas d'échec.
    }
  }

  const fallback = MEMORY_CACHE.__fallback || (MEMORY_CACHE.__fallback = await readFallbackFile());
  return fallback.votes.some((r) => r.user_id === userId && r.category === category && r.date === date);
}

export async function resetAll() {
  const backend = backendMode();

  if (backend === "database") {
    try {
      await resetDatabaseData();
    } catch {
      // Bascule sur le repli fichier/mémoire ci-dessous en cas d'échec.
    }
  }

  const fallback = MEMORY_CACHE.__fallback || (MEMORY_CACHE.__fallback = await readFallbackFile());
  fallback.votes = [];
  await writeFallbackFile(fallback);
  return {};
}

/* ---- Utilisateurs : créés par l'admin, identifiants en série (U001...) ---- */

export async function listUsers() {
  const backend = backendMode();

  if (backend === "database") {
    try {
      return await readDatabaseUsers();
    } catch {
      // Bascule sur le repli fichier/mémoire ci-dessous en cas d'échec.
    }
  }

  const fallback = MEMORY_CACHE.__fallback || (MEMORY_CACHE.__fallback = await readFallbackFile());
  return fallback.users.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
}

export async function createUser(label) {
  const backend = backendMode();

  if (backend === "database") {
    try {
      const existing = await readDatabaseUsers();
      const id = nextUserId(existing.map((u) => u.id));
      return await insertDatabaseUser(id, label);
    } catch {
      // Bascule sur le repli fichier/mémoire ci-dessous en cas d'échec.
    }
  }

  const fallback = MEMORY_CACHE.__fallback || (MEMORY_CACHE.__fallback = await readFallbackFile());
  const id = nextUserId(fallback.users.map((u) => u.id));
  const user = { id, label: label || null, created_at: new Date().toISOString() };
  fallback.users.push(user);
  await writeFallbackFile(fallback);
  return user;
}

export async function findUser(id) {
  if (!id) return null;
  const backend = backendMode();

  if (backend === "database") {
    try {
      return await findDatabaseUser(id);
    } catch {
      // Bascule sur le repli fichier/mémoire ci-dessous en cas d'échec.
    }
  }

  const fallback = MEMORY_CACHE.__fallback || (MEMORY_CACHE.__fallback = await readFallbackFile());
  return fallback.users.find((u) => u.id === id) || null;
}
