import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getStore as getNetlifyStore } from "@netlify/blobs";
import pg from "pg";

const CATEGORIES = ["sakafo", "logistique", "animation", "formateur"];
const STORE_NAME = "vote-app";
const KEY = "votes-data";
const COMMENT_MAX = 300;
const FALLBACK_FILE = process.env.VOTES_DATA_FILE || "/tmp/vote-app-data.json";
const MEMORY_CACHE = globalThis.__voteAppDataCache || (globalThis.__voteAppDataCache = {});

let supabaseClient = null;
let pgPool = null;

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

function sanitizeComment(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, COMMENT_MAX);
}

function resolveFallbackPath() {
  return resolve(FALLBACK_FILE);
}

async function readFallbackFile() {
  const filePath = resolveFallbackPath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeFallbackFile(data) {
  const filePath = resolveFallbackPath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data), "utf8");
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

function getPgPool() {
  if (pgPool) return pgPool;

  const connString = process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!connString) {
    return null;
  }

  pgPool = new pg.Pool({
    connectionString: connString,
    ssl: connString.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });
  return pgPool;
}

export function buildStateFromRows(rows = []) {
  const state = {};

  for (const row of rows) {
    const category = row.category;
    const date = row.date;
    if (!state[category]) state[category] = {};
    if (!state[category][date]) state[category][date] = emptyDay();

    const day = state[category][date];
    const value = Number(row.value);
    day.counts[String(value)] = (day.counts[String(value)] || 0) + 1;

    const comment = sanitizeComment(row.comment);
    if (comment) {
      if (!Array.isArray(day.comments)) day.comments = [];
      day.comments.push({ v: value, text: comment });
    }
  }

  return state;
}

async function readSupabaseData() {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("votes")
      .select("category, value, date, comment, created_at")
      .order("created_at", { ascending: true });

    if (!error) {
      return buildStateFromRows(data || []);
    }
  }

  const pool = getPgPool();
  if (!pool) return null;

  const { rows } = await pool.query(
    'SELECT category, value, date, comment, created_at FROM votes ORDER BY created_at ASC',
  );
  return buildStateFromRows(rows || []);
}

async function writeSupabaseVote(payload) {
  const client = getSupabaseClient();
  if (client) {
    const { error } = await client.from("votes").insert({
      category: payload.category,
      value: payload.value,
      date: payload.date,
      comment: sanitizeComment(payload.comment) || null,
    });

    if (!error) {
      return readSupabaseData();
    }
  }

  const pool = getPgPool();
  if (!pool) return null;

  await pool.query(
    'INSERT INTO votes (category, value, date, comment) VALUES ($1, $2, $3, $4)',
    [payload.category, payload.value, payload.date, sanitizeComment(payload.comment) || null],
  );
  return readSupabaseData();
}

async function resetSupabaseData() {
  const client = getSupabaseClient();
  if (client) {
    const { error } = await client.from("votes").delete().gte("created_at", "1900-01-01T00:00:00+00:00");
    if (!error) return {};
  }

  const pool = getPgPool();
  if (!pool) return null;

  await pool.query("DELETE FROM votes");
  return {};
}

async function readPersistedData() {
  const hasDbConfig = Boolean(process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL || process.env.SUPABASE_URL);
  if (!hasDbConfig && MEMORY_CACHE[KEY] !== undefined) {
    return { backend: "memory", data: MEMORY_CACHE[KEY] };
  }

  try {
    const supabaseData = await readSupabaseData();
    if (supabaseData !== null) {
      MEMORY_CACHE[KEY] = supabaseData;
      return { backend: "supabase", data: supabaseData };
    }
  } catch {
    // Fall back to the next storage option.
  }

  try {
    const store = getNetlifyStore(STORE_NAME, { consistency: "strong" });
    const data = (await store.get(KEY, { type: "json" })) || {};
    MEMORY_CACHE[KEY] = data;
    return { backend: "blobs", data, store };
  } catch {
    const data = await readFallbackFile();
    MEMORY_CACHE[KEY] = data;
    return { backend: "file", data, store: null };
  }
}

async function persistData(backend, store, data) {
  MEMORY_CACHE[KEY] = data;

  if (backend === "supabase") {
    return data;
  }

  if (backend === "blobs" && store) {
    await store.set(KEY, JSON.stringify(data));
    return data;
  }

  await writeFallbackFile(data);
  return data;
}

async function resetData(backend, store) {
  const cleared = {};
  if (backend === "supabase") {
    const result = await resetSupabaseData();
    MEMORY_CACHE[KEY] = result || cleared;
    return result || cleared;
  }

  await persistData(backend, store, cleared);
  return cleared;
}

export default async (req) => {
  const storeRef = await readPersistedData();
  const { backend, data, store } = storeRef;

  if (req.method === "GET") {
    return jsonResponse(data || {});
  }

  if (req.method === "DELETE") {
    const cleared = await resetData(backend, store);
    return jsonResponse({ success: true, data: cleared });
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
    const isValidDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);

    if (!CATEGORIES.includes(category) || ![1, 2, 3, 4, 5].includes(numValue) || !isValidDate) {
      return jsonResponse({ error: "Requête invalide" }, 400);
    }

    const current = data && typeof data === "object" ? data : {};
    let nextData = current;

    if (backend === "supabase") {
      try {
        nextData = (await writeSupabaseVote({ category, value: numValue, date, comment })) || current;
      } catch {
        nextData = current;
      }
    } else {
      if (!nextData[category]) nextData[category] = {};
      if (!nextData[category][date]) nextData[category][date] = emptyDay();

      const day = nextData[category][date];
      day.counts[String(numValue)] = (day.counts[String(numValue)] || 0) + 1;

      const cleanComment = sanitizeComment(comment);
      if (cleanComment) {
        if (!Array.isArray(day.comments)) day.comments = [];
        day.comments.push({ v: numValue, text: cleanComment });
      }

      await persistData(backend, store, nextData);
    }

    return jsonResponse({ success: true, data: nextData });
  }

  return jsonResponse({ error: "Méthode non supportée" }, 405);
};
