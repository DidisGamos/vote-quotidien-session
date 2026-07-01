/* =========================================================================
   Sondaha isan'andro — vote quotidien (page publique)
   -------------------------------------------------------------------------
   Modèle de données (partagé, stocké côté serveur en JSON via Netlify Blobs,
   avec repli automatique sur localStorage si le backend n'est pas dispo) :

   {
     "sakafo": {
       "2026-07-01": {
         "counts": {"1":0,"2":2,"3":5,"4":10,"5":3},
         "comments": [{"v":4,"text":"Très bon accueil"}, ...]
       }
     },
     "logistique": { ... },
     "animation":  { ... },
     "formateur":  { ... }
   }
   Aucune information sur l'identité des votants n'est stockée : uniquement
   des compteurs agrégés et des commentaires libres, par jour et par catégorie.
========================================================================= */

const API_URL = "/api/votes";
const LOCAL_FALLBACK_KEY = "voteapp_fallback_data_v2";
const LAST_VOTE_KEY = "voteapp_last_vote_v2";
const LAST_SEEN_TOTAL_KEY = "voteapp_last_seen_total_v2";
const COMMENT_MAX = 300;

const CATEGORIES = [
  {
    id: "sakafo",
    label: "Sakafo",
    sub: "Restauration de la journée",
    accent: "var(--orange)",
    icon: `<path d="M6 3v7a2 2 0 0 0 2 2v9M6 3v6M9 3v6M6 9h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 3c-1.5 0-3 1.6-3 4.5S14 12 15 12v9" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    id: "logistique",
    label: "Environnement & logistique",
    sub: "Salle, matériel, organisation",
    accent: "var(--blue)",
    icon: `<path d="M10.3 3.5h3.4l.6 2.3a6.4 6.4 0 0 1 1.7 1l2.3-.8 1.7 3-1.8 1.6a6.4 6.4 0 0 1 0 2l1.8 1.6-1.7 3-2.3-.8a6.4 6.4 0 0 1-1.7 1l-.6 2.3h-3.4l-.6-2.3a6.4 6.4 0 0 1-1.7-1l-2.3.8-1.7-3 1.8-1.6a6.4 6.4 0 0 1 0-2L4.1 8.9l1.7-3 2.3.8a6.4 6.4 0 0 1 1.7-1z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.4" fill="none"/>`,
  },
  {
    id: "animation",
    label: "Animation",
    sub: "Ambiance & dynamisme",
    accent: "var(--scale-3)",
    icon: `<path d="M12 3l1.8 4.8L19 9l-4 3.4L16.2 18 12 15.2 7.8 18 9 12.4 5 9l5.2-1.2z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>`,
  },
  {
    id: "formateur",
    label: "Formateur",
    sub: "Pédagogie & clarté",
    accent: "var(--blue-dark)",
    icon: `<path d="M3 9.5 12 5l9 4.5-9 4.5-9-4.5z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M21 9.5v5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  },
];

const SCALE_COLORS = {
  1: "var(--scale-1)",
  2: "var(--scale-2)",
  3: "var(--scale-3)",
  4: "var(--scale-4)",
  5: "var(--scale-5)",
};

let store = {};
let usingLocalFallback = false;
const selectedValues = {}; // { catId: 1..5 }

/* ---------------------------------------------------------------------
   Utilitaires
--------------------------------------------------------------------- */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function emptyDay() {
  return { counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, comments: [] };
}
function getDay(catId, dateStr) {
  const day = store[catId] && store[catId][dateStr];
  return day || emptyDay();
}
function dayTotal(day) {
  return [1, 2, 3, 4, 5].reduce((s, v) => s + (day.counts[v] || 0), 0);
}
function dayAverage(day) {
  const total = dayTotal(day);
  if (!total) return 0;
  const sum = [1, 2, 3, 4, 5].reduce((s, v) => s + v * (day.counts[v] || 0), 0);
  return sum / total;
}
function grandTotal(data) {
  let total = 0;
  Object.values(data || {}).forEach((cat) => {
    Object.values(cat).forEach((day) => (total += dayTotal(day)));
  });
  return total;
}
function formatDateLong(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function readLastVotes() {
  try {
    return JSON.parse(localStorage.getItem(LAST_VOTE_KEY)) || {};
  } catch {
    return {};
  }
}
function writeLastVotes(obj) {
  localStorage.setItem(LAST_VOTE_KEY, JSON.stringify(obj));
}
function hasVotedToday(catId) {
  return readLastVotes()[catId] === todayStr();
}
function markVotedToday(catId) {
  const last = readLastVotes();
  last[catId] = todayStr();
  writeLastVotes(last);
}

/* ---------------------------------------------------------------------
   Accès aux données (serveur avec repli localStorage)
--------------------------------------------------------------------- */
function readLocalFallback() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_FALLBACK_KEY)) || {};
  } catch {
    return {};
  }
}
function writeLocalFallback(data) {
  localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(data));
}

async function loadData() {
  try {
    const res = await fetch(API_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("bad status " + res.status);
    const data = await res.json();
    usingLocalFallback = false;
    return data;
  } catch (err) {
    usingLocalFallback = true;
    return readLocalFallback();
  }
}

async function submitVote(catId, value, comment) {
  const date = todayStr();

  if (!store[catId]) store[catId] = {};
  if (!store[catId][date]) store[catId][date] = emptyDay();
  store[catId][date].counts[String(value)] =
    (store[catId][date].counts[String(value)] || 0) + 1;
  if (comment) store[catId][date].comments.push({ v: value, text: comment });

  if (usingLocalFallback) {
    writeLocalFallback(store);
    return { ok: true };
  }

  try {
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: catId,
          value,
          date,
          comment: comment || "",
        }),
      });
      if (res.status !== 503) break; // 503 = conflit d'écriture temporaire, on retente
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
    }
    if (!res.ok) throw new Error("bad status " + res.status);
    const payload = await res.json();
    if (payload && payload.data) store = payload.data;
    return { ok: true };
  } catch (err) {
    usingLocalFallback = true;
    writeLocalFallback(store);
    return { ok: true, offline: true };
  }
}

/* ---------------------------------------------------------------------
   Rendu — carte de vote (jauge en éventail)
--------------------------------------------------------------------- */
function petalGaugeSVG() {
  const pivot = { x: 70, y: 78 };
  const angles = [-60, -30, 0, 30, 60];
  const parts = angles
    .map((a, i) => {
      const v = i + 1;
      return `<g transform="rotate(${a} ${pivot.x} ${pivot.y})">
      <rect class="petal" data-v="${v}"
        x="${pivot.x - 5}" y="${pivot.y - 40}" width="10" height="40" rx="5"
        fill="${SCALE_COLORS[v]}" style="transform:scaleY(0.06)"/>
    </g>`;
    })
    .join("");
  return `<svg viewBox="0 0 140 88" width="112" height="70">
    ${parts}
    <circle cx="${pivot.x}" cy="${pivot.y}" r="3.4" fill="#fff" stroke="var(--line)" stroke-width="1"/>
  </svg>`;
}

function renderCategoryGrid() {
  const grid = document.getElementById("category-grid");
  grid.innerHTML = CATEGORIES.map((cat) => {
    const voted = hasVotedToday(cat.id);
    return `
    <article class="card" style="--card-accent:${cat.accent}" data-cat="${cat.id}">
      <div class="card-head">
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <span class="card-icon"><svg viewBox="0 0 24 24" width="19" height="19">${cat.icon}</svg></span>
          <div>
            <h3 class="card-title">${cat.label}</h3>
            <p class="card-sub">${cat.sub}</p>
          </div>
        </div>
        ${voted ? "" : `<span class="badge-new" data-role="badge">Nouveau vote</span>`}
      </div>

      <div class="gauge-wrap">
        ${petalGaugeSVG()}
        <div class="gauge-meta" data-role="meta"></div>
      </div>

      <div class="vote-row" data-role="votebtns">
        ${[1, 2, 3, 4, 5].map((v) => `<button class="vote-btn" data-cat="${cat.id}" data-v="${v}" ${voted ? "disabled" : ""}>${v}</button>`).join("")}
      </div>

      <div class="comment-field">
        <label for="comment-${cat.id}">Commentaire (optionnel)</label>
        <textarea id="comment-${cat.id}" data-cat="${cat.id}" maxlength="${COMMENT_MAX}"
          placeholder="Votre avis en quelques mots…" ${voted ? "disabled" : ""}></textarea>
        <span class="char-count" data-role="charcount">0 / ${COMMENT_MAX}</span>
      </div>

      <div class="card-status" data-role="status"></div>
    </article>`;
  }).join("");

  grid
    .querySelectorAll(".vote-btn")
    .forEach((btn) => btn.addEventListener("click", onSelectValue));
  grid
    .querySelectorAll("textarea[data-cat]")
    .forEach((ta) => ta.addEventListener("input", onCommentInput));

  updateAllCardStats();
  updateGlobalSubmitBar();
}

function updateAllCardStats() {
  const date = todayStr();
  CATEGORIES.forEach((cat) => updateCardStats(cat.id, date));
}

function updateCardStats(catId, date) {
  const card = document.querySelector(`.card[data-cat="${catId}"]`);
  if (!card) return;
  const day = getDay(catId, date);
  const total = dayTotal(day);
  const avg = dayAverage(day);
  const max = Math.max(1, ...[1, 2, 3, 4, 5].map((v) => day.counts[v] || 0));

  card.querySelectorAll(".petal").forEach((rect) => {
    const v = rect.dataset.v;
    const ratio = Math.max((day.counts[v] || 0) / max, 0.06);
    rect.style.transform = `scaleY(${ratio})`;
  });

  const meta = card.querySelector('[data-role="meta"]');
  meta.innerHTML = `
    <div class="gauge-total">${total}<span>vote${total > 1 ? "s" : ""} aujourd'hui</span></div>
    <div class="gauge-avg">Moyenne du jour : <strong>${total ? avg.toFixed(1) : "—"}</strong> / 5</div>
  `;

  const status = card.querySelector('[data-role="status"]');
  if (hasVotedToday(catId)) {
    status.innerHTML = `<span class="ok-dot"></span> Merci, votre vote du jour a été pris en compte.`;
  } else {
    status.innerHTML = `Choisissez une note de 1 à 5, puis envoyez.`;
  }
}

function onSelectValue(e) {
  const btn = e.currentTarget;
  const catId = btn.dataset.cat;
  if (hasVotedToday(catId)) return;
  const value = Number(btn.dataset.v);
  selectedValues[catId] = value;

  const card = document.querySelector(`.card[data-cat="${catId}"]`);
  card
    .querySelectorAll(".vote-btn")
    .forEach((b) =>
      b.classList.toggle("selected", Number(b.dataset.v) === value),
    );

  updateGlobalSubmitBar();
}

function onCommentInput(e) {
  const ta = e.currentTarget;
  const card = document.querySelector(`.card[data-cat="${ta.dataset.cat}"]`);
  card.querySelector('[data-role="charcount"]').textContent =
    `${ta.value.length} / ${COMMENT_MAX}`;
}

/* ---------------------------------------------------------------------
   Vote global — un seul bouton envoie toutes les catégories notées
--------------------------------------------------------------------- */
function remainingCategories() {
  return CATEGORIES.filter((cat) => !hasVotedToday(cat.id));
}

function pendingCategories() {
  return remainingCategories().filter((cat) => selectedValues[cat.id]);
}

function updateGlobalSubmitBar() {
  const bar = document.getElementById("global-submit-bar");
  const status = document.getElementById("gsb-status");
  const btn = document.getElementById("submit-all-btn");
  if (!bar || !status || !btn) return;

  const remaining = remainingCategories();
  const pending = pendingCategories();

  if (remaining.length === 0) {
    status.textContent =
      "Merci, votre vote du jour a été pris en compte pour tous les volets.";
    btn.disabled = true;
    btn.textContent = "Vote déjà envoyé aujourd'hui";
    return;
  }

  btn.disabled = pending.length !== remaining.length;
  btn.textContent = "Envoyer mon vote";

  if (pending.length === 0) {
    status.textContent = `Choisissez une note pour ${remaining.length > 1 ? "chaque volet" : "le volet"}, puis envoyez.`;
  } else if (pending.length < remaining.length) {
    const missing = remaining.length - pending.length;
    status.textContent = `Il reste ${missing} volet${missing > 1 ? "s" : ""} à noter avant d'envoyer.`;
  } else {
    status.textContent = "Toutes les notes sont prêtes. Envoyez votre vote.";
  }
}

async function onSubmitAll() {
  const remaining = remainingCategories();
  if (remaining.length === 0) return;
  const pending = pendingCategories();
  if (pending.length !== remaining.length) return; // pas toutes les catégories notées

  const btn = document.getElementById("submit-all-btn");
  const status = document.getElementById("gsb-status");
  btn.disabled = true;
  btn.textContent = "Envoi…";
  status.textContent = "Envoi de votre vote en cours…";

  document.querySelectorAll(".vote-btn").forEach((b) => (b.disabled = true));
  document
    .querySelectorAll("textarea[data-cat]")
    .forEach((ta) => (ta.disabled = true));

  for (const cat of pending) {
    const card = document.querySelector(`.card[data-cat="${cat.id}"]`);
    const comment = card
      .querySelector(`textarea[data-cat="${cat.id}"]`)
      .value.trim()
      .slice(0, COMMENT_MAX);

    await submitVote(cat.id, selectedValues[cat.id], comment);
    markVotedToday(cat.id);

    const badge = card.querySelector('[data-role="badge"]');
    if (badge) badge.remove();
    updateCardStats(cat.id, todayStr());
  }

  updateGlobalSubmitBar();
  showToast("Votre vote a été enregistré. Merci !");
}

/* ---------------------------------------------------------------------
   Toast
--------------------------------------------------------------------- */
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.innerHTML = `<span class="dot"></span> ${msg}`;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

/* ---------------------------------------------------------------------
   Actualisation / polling multi-utilisateurs
--------------------------------------------------------------------- */
function getLastSeenTotal() {
  return Number(localStorage.getItem(LAST_SEEN_TOTAL_KEY) || 0);
}
function setLastSeenTotal(n) {
  localStorage.setItem(LAST_SEEN_TOTAL_KEY, String(n));
}

async function refreshData({ silent } = {}) {
  const btn = document.getElementById("refresh-btn");
  if (!silent) btn.classList.add("spinning");

  const fresh = await loadData();
  const newTotal = grandTotal(fresh);
  const lastSeen = getLastSeenTotal();

  store = fresh;
  updateAllCardStats();
  updateGlobalSubmitBar();

  if (!silent) {
    setLastSeenTotal(newTotal);
    document.getElementById("new-badge").hidden = true;
    showToast("Votes actualisés");
    setTimeout(() => btn.classList.remove("spinning"), 500);
  } else if (newTotal > lastSeen) {
    document.getElementById("new-badge").hidden = false;
  }
}

/* ---------------------------------------------------------------------
   Init
--------------------------------------------------------------------- */
async function init() {
  document.getElementById("today-label").textContent =
    formatDateLong(todayStr());

  store = await loadData();
  setLastSeenTotal(grandTotal(store));
  renderCategoryGrid();

  document
    .getElementById("refresh-btn")
    .addEventListener("click", () => refreshData({ silent: false }));
  document
    .getElementById("submit-all-btn")
    .addEventListener("click", onSubmitAll);
  setInterval(() => refreshData({ silent: true }), 25000);
}

init();
