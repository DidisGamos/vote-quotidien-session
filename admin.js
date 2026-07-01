/* =========================================================================
   Page admin — historique complet & commentaires
   Non authentifiée : accessible uniquement à qui possède le lien direct
   (admin.html). Pas de lien vers cette page depuis le site public.
========================================================================= */

const API_URL = "/api/votes";
const LOCAL_FALLBACK_KEY = "voteapp_fallback_data_v2";

const CATEGORIES = [
  { id: "sakafo", label: "Sakafo", accent: "var(--orange)" },
  {
    id: "logistique",
    label: "Environnement & logistique",
    accent: "var(--blue)",
  },
  { id: "animation", label: "Animation", accent: "var(--scale-3)" },
  { id: "formateur", label: "Formateur", accent: "var(--blue-dark)" },
];

const SCALE_COLORS = {
  1: "var(--scale-1)",
  2: "var(--scale-2)",
  3: "var(--scale-3)",
  4: "var(--scale-4)",
  5: "var(--scale-5)",
};

let store = {};
let currentCategory = CATEGORIES[0].id;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function emptyDay() {
  return { counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, comments: [] };
}
function getDay(catId, date) {
  return (store[catId] && store[catId][date]) || emptyDay();
}
function dayTotal(day) {
  return [1, 2, 3, 4, 5].reduce((s, v) => s + (day.counts[v] || 0), 0);
}
function dayAverage(day) {
  const total = dayTotal(day);
  if (!total) return 0;
  return (
    [1, 2, 3, 4, 5].reduce((s, v) => s + v * (day.counts[v] || 0), 0) / total
  );
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
function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function readLocalFallback() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_FALLBACK_KEY)) || {};
  } catch {
    return {};
  }
}

async function loadData() {
  try {
    const res = await fetch(API_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("bad status " + res.status);
    return await res.json();
  } catch {
    return readLocalFallback();
  }
}

function allDatesForCategory(catId) {
  const cat = store[catId] || {};
  const dates = Object.keys(cat).sort((a, b) => (a < b ? 1 : -1));
  if (!dates.includes(todayStr())) dates.unshift(todayStr());
  return dates;
}

function renderCatSeg() {
  const seg = document.getElementById("history-cat-seg");
  seg.innerHTML = CATEGORIES.map(
    (c) =>
      `<button data-cat="${c.id}" class="${c.id === currentCategory ? "active" : ""}">${c.label}</button>`,
  ).join("");
  seg.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      currentCategory = b.dataset.cat;
      renderCatSeg();
      renderDateSelect();
      renderAll();
    }),
  );
}

function renderDateSelect() {
  const sel = document.getElementById("history-date-select");
  const dates = allDatesForCategory(currentCategory);
  sel.innerHTML = dates
    .map((d) => `<option value="${d}">${formatDateLong(d)}</option>`)
    .join("");
  sel.onchange = renderAll;
}

function renderSummary() {
  const sel = document.getElementById("history-date-select");
  const date = sel.value || todayStr();
  const day = getDay(currentCategory, date);
  const total = dayTotal(day);
  const max = Math.max(1, ...[1, 2, 3, 4, 5].map((v) => day.counts[v] || 0));
  const avg = dayAverage(day);
  const cat = CATEGORIES.find((c) => c.id === currentCategory);

  document.getElementById("history-summary").innerHTML = `
    <div class="hs-head">
      <h4>${cat.label} — ${formatDateLong(date)}</h4>
      <span class="hs-total">${total} vote${total > 1 ? "s" : ""} · moyenne ${total ? avg.toFixed(2) : "—"} / 5</span>
    </div>
    ${[5, 4, 3, 2, 1]
      .map((v) => {
        const count = day.counts[v] || 0;
        const pct = Math.round((count / max) * 100);
        return `<div class="bar-row">
        <span class="lbl">Note ${v}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%; background:${SCALE_COLORS[v]}"></span></span>
        <span class="count">${count}</span>
      </div>`;
      })
      .join("")}
  `;
}

function renderComments() {
  const sel = document.getElementById("history-date-select");
  const date = sel.value || todayStr();
  const day = getDay(currentCategory, date);
  const list = document.getElementById("comments-list");

  if (!day.comments.length) {
    list.innerHTML = `<div class="empty-state">Aucun commentaire laissé ce jour-là pour ce volet.</div>`;
    return;
  }

  list.innerHTML = day.comments
    .slice()
    .reverse()
    .map(
      (
        c,
      ) => `<div class="comment-card" style="--card-accent:${SCALE_COLORS[c.v]}">
        <span class="cc-score" style="background:${SCALE_COLORS[c.v]}">${c.v}</span>
        <div>
          <div class="cc-text">${escapeHtml(c.text)}</div>
          <div class="cc-meta">Anonyme · ${formatDateShort(date)}</div>
        </div>
      </div>`,
    )
    .join("");
}

function renderHistoryList() {
  const dates = allDatesForCategory(currentCategory);
  const list = document.getElementById("history-list");

  const hasAny = dates.some((d) => dayTotal(getDay(currentCategory, d)) > 0);
  if (!hasAny) {
    list.innerHTML = `<div class="empty-state">Aucun historique pour l'instant.</div>`;
    return;
  }

  list.innerHTML = dates
    .map((date) => {
      const day = getDay(currentCategory, date);
      const total = dayTotal(day);
      const segs = [1, 2, 3, 4, 5]
        .map((v) => {
          const pct = total ? ((day.counts[v] || 0) / total) * 100 : 0;
          return `<span class="hd-seg" style="width:${pct}%; background:${SCALE_COLORS[v]}" title="Note ${v} : ${day.counts[v] || 0}"></span>`;
        })
        .join("");
      return `<div class="hist-day">
        <span class="hd-date">${formatDateShort(date)}</span>
        <span class="hd-stack">${segs}</span>
        <span class="hd-total">${total} vote${total > 1 ? "s" : ""} · ${day.comments.length} com.</span>
      </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  renderSummary();
  renderComments();
  renderHistoryList();
  renderOverview();
}

/* =========================================================================
   Vue globale (tous volets confondus)
========================================================================= */
function allDatesAllCategories() {
  const dates = new Set([todayStr()]);
  CATEGORIES.forEach((c) => {
    Object.keys(store[c.id] || {}).forEach((d) => dates.add(d));
  });
  return Array.from(dates).sort((a, b) => (a < b ? 1 : -1));
}

function categoryGrandTotal(catId) {
  const cat = store[catId] || {};
  let total = 0;
  let sum = 0;
  let comments = 0;
  Object.values(cat).forEach((day) => {
    total += dayTotal(day);
    sum += [1, 2, 3, 4, 5].reduce((s, v) => s + v * (day.counts[v] || 0), 0);
    comments += (day.comments || []).length;
  });
  return { total, avg: total ? sum / total : 0, comments };
}

function renderOverview() {
  const dates = allDatesAllCategories();

  // Totaux par volet
  const catTotals = CATEGORIES.map((c) => ({
    ...c,
    ...categoryGrandTotal(c.id),
  }));
  const grandTotalVotes = catTotals.reduce((s, c) => s + c.total, 0);
  const grandTotalComments = catTotals.reduce((s, c) => s + c.comments, 0);
  const activeDays = dates.filter((d) =>
    CATEGORIES.some((c) => dayTotal(getDay(c.id, d)) > 0),
  ).length;

  // Hero — chiffres clés globaux
  document.getElementById("overview-hero").innerHTML = `
    <div class="hero-stat">
      <span class="hero-num">${grandTotalVotes}</span>
      <span class="hero-lbl">Votes au total (tous volets)</span>
    </div>
    <div class="hero-stat">
      <span class="hero-num">${grandTotalComments}</span>
      <span class="hero-lbl">Commentaires laissés</span>
    </div>
    <div class="hero-stat">
      <span class="hero-num">${activeDays}</span>
      <span class="hero-lbl">Jour${activeDays > 1 ? "s" : ""} avec au moins un vote</span>
    </div>
  `;

  // Cartes par volet
  document.getElementById("overview-cats").innerHTML = catTotals
    .map(
      (c) => `
      <div class="overview-cat-card" style="--card-accent:${c.accent}">
        <div class="occ-head">
          <span class="occ-dot" style="background:${c.accent}"></span>
          <h4>${c.label}</h4>
        </div>
        <div class="occ-total">${c.total}<span>vote${c.total > 1 ? "s" : ""}</span></div>
        <div class="occ-meta">Moyenne : <strong>${c.total ? c.avg.toFixed(2) : "—"}</strong> / 5</div>
        <div class="occ-meta">${c.comments} commentaire${c.comments > 1 ? "s" : ""}</div>
      </div>`,
    )
    .join("");

  // Participation par jour, toutes catégories confondues
  const hasAny = dates.some((d) =>
    CATEGORIES.some((c) => dayTotal(getDay(c.id, d)) > 0),
  );
  const list = document.getElementById("overview-daily");
  if (!hasAny) {
    list.innerHTML = `<div class="empty-state">Aucun vote pour l'instant.</div>`;
    return;
  }

  list.innerHTML = dates
    .map((date) => {
      const perCat = CATEGORIES.map((c) => ({
        ...c,
        total: dayTotal(getDay(c.id, date)),
      }));
      const dayGrandTotal = perCat.reduce((s, c) => s + c.total, 0);
      const segs = perCat
        .map((c) => {
          const pct = dayGrandTotal ? (c.total / dayGrandTotal) * 100 : 0;
          return `<span class="hd-seg" style="width:${pct}%; background:${c.accent}" title="${c.label} : ${c.total}"></span>`;
        })
        .join("");
      return `<div class="hist-day">
        <span class="hd-date">${formatDateShort(date)}</span>
        <span class="hd-stack">${segs}</span>
        <span class="hd-total">${dayGrandTotal} vote${dayGrandTotal > 1 ? "s" : ""}</span>
      </div>`;
    })
    .join("");
}

function initTabs() {
  const tabs = document.getElementById("admin-tabs");
  tabs.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs
        .querySelectorAll("button")
        .forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("tab-overview").hidden =
        btn.dataset.tab !== "overview";
      document.getElementById("tab-detail").hidden =
        btn.dataset.tab !== "detail";
    });
  });
}

async function refresh() {
  const btn = document.getElementById("refresh-btn");
  btn.classList.add("spinning");
  store = await loadData();
  renderDateSelect();
  renderAll();
  setTimeout(() => btn.classList.remove("spinning"), 500);
}

async function init() {
  initTabs();
  renderCatSeg();
  store = await loadData();
  renderDateSelect();
  renderAll();
  document.getElementById("refresh-btn").addEventListener("click", refresh);
  setInterval(() => {
    loadData().then((d) => {
      store = d;
      renderAll();
    });
  }, 30000);
}

init();
