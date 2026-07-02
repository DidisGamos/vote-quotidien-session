/* =========================================================================
   Authentification de l'espace admin.
   -------------------------------------------------------------------------
   Un seul mot de passe partagé (variable d'env ADMIN_PASSWORD), pas de
   compte individuel : le site reste anonyme pour les votants, seule
   l'équipe organisatrice a besoin de se connecter pour voir l'historique.

   La session est un cookie HttpOnly signé (HMAC-SHA256), sans état côté
   serveur : pas besoin de table "sessions", juste vérifier la signature et
   l'expiration à chaque requête.
========================================================================= */

import crypto from "node:crypto";

export const COOKIE_NAME = "admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12h

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error(
      "ADMIN_PASSWORD (ou ADMIN_SESSION_SECRET) doit être défini dans les variables d'environnement.",
    );
  }
  return secret;
}

function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

function createSessionToken() {
  const expiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000;
  const payload = `admin.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function isValidSessionToken(token) {
  if (!token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [role, expiresAtStr, signature] = parts;
  const payload = `${role}.${expiresAtStr}`;

  let expectedSig;
  try {
    expectedSig = sign(payload);
  } catch {
    return false;
  }

  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSig, "hex");
  if (sigBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  return role === "admin";
}

export function parseCookies(req) {
  const header = req.headers?.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return cookies;
}

export function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return isValidSessionToken(cookies[COOKIE_NAME]);
}

/**
 * Compare le mot de passe saisi à ADMIN_PASSWORD en temps constant, pour
 * éviter les attaques par mesure de timing.
 */
export function checkPassword(candidate) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof candidate !== "string" || !candidate) return false;

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  if (candidateBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

function isLocalRequest(req) {
  const host = req.headers?.host || "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

export function buildSessionCookie(req) {
  const token = createSessionToken();
  const secureFlag = isLocalRequest(req) ? "" : " Secure;";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly;${secureFlag} SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION_SECONDS}`;
}

export function buildClearCookie(req) {
  const secureFlag = isLocalRequest(req) ? "" : " Secure;";
  return `${COOKIE_NAME}=; HttpOnly;${secureFlag} SameSite=Lax; Path=/; Max-Age=0`;
}

/* =========================================================================
   Identification des votants ("utilisateurs anonymes" connectés par ID)
   -------------------------------------------------------------------------
   Pas de mot de passe : le votant saisit simplement l'identifiant créé par
   l'admin (ex: U001). On vérifie que l'identifiant existe côté serveur au
   moment de la connexion, puis on pose un cookie signé (HMAC) qui porte cet
   identifiant, pour tracer ses votes sans lui redemander son ID à chaque
   fois. Ce n'est pas une frontière de sécurité forte (pas de mot de passe),
   juste une identification pratique pour l'historique.
========================================================================= */

export const VOTER_COOKIE_NAME = "voter_session";
const VOTER_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 jours

function getVoterSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "sondaha-voter-fallback-secret"
  );
}

function signVoter(value) {
  return crypto.createHmac("sha256", getVoterSecret()).update(value).digest("hex");
}

export function buildVoterSessionCookie(req, userId) {
  const expiresAt = Date.now() + VOTER_SESSION_DURATION_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  const token = `${payload}.${signVoter(payload)}`;
  const secureFlag = isLocalRequest(req) ? "" : " Secure;";
  return `${VOTER_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly;${secureFlag} SameSite=Lax; Path=/; Max-Age=${VOTER_SESSION_DURATION_SECONDS}`;
}

export function buildClearVoterCookie(req) {
  const secureFlag = isLocalRequest(req) ? "" : " Secure;";
  return `${VOTER_COOKIE_NAME}=; HttpOnly;${secureFlag} SameSite=Lax; Path=/; Max-Age=0`;
}

/** Renvoie l'identifiant du votant si le cookie de session est valide, sinon null. */
export function getVoterId(req) {
  const cookies = parseCookies(req);
  const token = cookies[VOTER_COOKIE_NAME];
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, signature] = parts;
  const payload = `${userId}.${expiresAtStr}`;

  let expectedSig;
  try {
    expectedSig = signVoter(payload);
  } catch {
    return null;
  }

  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSig, "hex");
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return userId || null;
}
