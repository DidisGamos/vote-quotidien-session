/* =========================================================================
   Page admin — historique complet & commentaires
   -------------------------------------------------------------------------
   Protégée par un mot de passe partagé (voir lib/auth.js côté serveur).
   Deux vues volontairement séparées pour éviter toute confusion :
   - "Aujourd'hui"  : uniquement les votes du jour en cours.
   - "Historique"    : uniquement les jours précédents (jamais aujourd'hui).
   Quand une nouvelle journée commence, "Aujourd'hui" repart à zéro tout
   seul et la veille apparaît automatiquement dans "Historique" — aucune
   action manuelle n'est nécessaire.
========================================================================= */

const DATA_URL = "/api/admin/data";
const USERS_URL = "/api/admin/users";
const ARCHIVE_URL = "/api/admin/archived";
const LOGIN_URL = "/admin/login";

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
let historyFilteredStore = null; // non-null quand un identifiant est sélectionné
let allUsers = [];
let todayCategory = CATEGORIES[0].id;
let historyCategory = CATEGORIES[0].id;
let modalState = null;
let justReset = false;
let archivedItems = [];

/* --------------------------- Utilitaires --------------------------- */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
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
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* --------------------------- Chargement des données --------------------------- */

async function loadData({ userId } = {}) {
  const url = userId
    ? `${DATA_URL}?user=${encodeURIComponent(userId)}`
    : DATA_URL;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status === 401) {
    window.location.href = LOGIN_URL;
    return {};
  }
  if (!res.ok) throw new Error("bad status " + res.status);
  return await res.json();
}

/* =========================================================================
   Onglet "Aujourd'hui" — uniquement le jour en cours
========================================================================= */

function renderTodayCatSeg() {
  const seg = document.getElementById("today-cat-seg");
  seg.innerHTML = CATEGORIES.map(
    (c) =>
      `<button data-cat="${c.id}" class="${c.id === todayCategory ? "active" : ""}">${c.label}</button>`,
  ).join("");
  seg.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      todayCategory = b.dataset.cat;
      renderTodayCatSeg();
      renderTodayDetail();
    }),
  );
}

function renderTodayHero() {
  const date = todayStr();
  document.getElementById("today-date-label").textContent =
    formatDateLong(date);

  let totalVotes = 0;
  let totalComments = 0;
  let weightedSum = 0;

  CATEGORIES.forEach((c) => {
    const day = getDay(c.id, date);
    const t = dayTotal(day);
    totalVotes += t;
    totalComments += day.comments.length;
    weightedSum += [1, 2, 3, 4, 5].reduce(
      (s, v) => s + v * (day.counts[v] || 0),
      0,
    );
  });

  const avg = totalVotes ? (weightedSum / totalVotes).toFixed(2) : "—";

  const votedByUser = store._todayVotedByUser || {};
  const votedCount = Object.keys(votedByUser).length;

  document.getElementById("today-hero").innerHTML = `
    <div class="hero-stat">
      <span class="hero-num">${totalVotes}</span>
      <span class="hero-lbl">Votes aujourd&#39;hui (tous volets)</span>
    </div>
    <div class="hero-stat">
      <span class="hero-num">${avg}</span>
      <span class="hero-lbl">Moyenne du jour / 5</span>
    </div>
    <div class="hero-stat">
      <span class="hero-num">${totalComments}</span>
      <span class="hero-lbl">Commentaire${totalComments > 1 ? "s" : ""} aujourd&#39;hui</span>
    </div>
    <div class="hero-stat">
      <span class="hero-num">${votedCount}</span>
      <span class="hero-lbl">Utilisateur${votedCount > 1 ? "s" : ""} ayant voté</span>
    </div>
  `;
}

function renderTodayCats() {
  const date = todayStr();
  document.getElementById("today-cats").innerHTML = CATEGORIES.map((c) => {
    const day = getDay(c.id, date);
    const total = dayTotal(day);
    const avg = dayAverage(day);
    return `
      <div class="overview-cat-card" style="--card-accent:${c.accent}">
        <div class="occ-head">
          <span class="occ-dot" style="background:${c.accent}"></span>
          <h4>${c.label}</h4>
        </div>
        <div class="occ-total">${total}<span>vote${total > 1 ? "s" : ""}</span></div>
        <div class="occ-meta">Moyenne : <strong>${total ? avg.toFixed(2) : "—"}</strong> / 5</div>
        <div class="occ-meta">${day.comments.length} commentaire${day.comments.length > 1 ? "s" : ""}</div>
      </div>`;
  }).join("");
}

function renderTodayDetail() {
  const date = todayStr();
  const day = getDay(todayCategory, date);
  const total = dayTotal(day);
  const max = Math.max(1, ...[1, 2, 3, 4, 5].map((v) => day.counts[v] || 0));
  const avg = dayAverage(day);
  const cat = CATEGORIES.find((c) => c.id === todayCategory);

  document.getElementById("today-summary").innerHTML = `
    <div class="hs-head">
      <h4>${cat.label} — aujourd&#39;hui</h4>
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

  const list = document.getElementById("today-comments");
  if (!day.comments.length) {
    list.innerHTML = `<div class="empty-state">Aucun commentaire laissé aujourd&#39;hui pour ce volet.</div>`;
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
          <div class="cc-meta">Anonyme · aujourd&#39;hui</div>
        </div>
      </div>`,
    )
    .join("");
}

function renderToday() {
  renderTodayHero();
  renderTodayCats();
  renderTodayDetail();
}

function renderYesterdayHero() {
  const date = yesterdayStr();
  const label = document.getElementById("yesterday-date-label");
  if (label) label.textContent = formatDateLong(date);

  let totalVotes = 0;
  let totalComments = 0;
  let weightedSum = 0;

  CATEGORIES.forEach((c) => {
    const day = getDay(c.id, date);
    const t = dayTotal(day);
    totalVotes += t;
    totalComments += day.comments.length;
    weightedSum += [1, 2, 3, 4, 5].reduce(
      (s, v) => s + v * (day.counts[v] || 0),
      0,
    );
  });

  const avg = totalVotes ? (weightedSum / totalVotes).toFixed(2) : "—";
  const hero = document.getElementById("yesterday-hero");
  if (!hero) return;
  hero.innerHTML = `
    <div class="hero-stat">
      <span class="hero-num">${totalVotes}</span>
      <span class="hero-lbl">Votes hier (tous volets)</span>
    </div>
    <div class="hero-stat">
      <span class="hero-num">${avg}</span>
      <span class="hero-lbl">Moyenne d&#39;hier / 5</span>
    </div>
    <div class="hero-stat">
      <span class="hero-num">${totalComments}</span>
      <span class="hero-lbl">Commentaire${totalComments > 1 ? "s" : ""} hier</span>
    </div>
  `;
}

function renderYesterdayCats() {
  const date = yesterdayStr();
  const container = document.getElementById("yesterday-cats");
  if (!container) return;
  container.innerHTML = CATEGORIES.map((c) => {
    const day = getDay(c.id, date);
    const total = dayTotal(day);
    const avg = dayAverage(day);
    return `
      <div class="overview-cat-card" style="--card-accent:${c.accent}">
        <div class="occ-head">
          <span class="occ-dot" style="background:${c.accent}"></span>
          <h4>${c.label}</h4>
        </div>
        <div class="occ-total">${total}<span>vote${total > 1 ? "s" : ""}</span></div>
        <div class="occ-meta">Moyenne : <strong>${total ? avg.toFixed(2) : "—"}</strong> / 5</div>
        <div class="occ-meta">${day.comments.length} commentaire${day.comments.length > 1 ? "s" : ""}</div>
      </div>`;
  }).join("");
}

/* =========================================================================
   Onglet "Historique" — uniquement les jours PRÉCÉDENTS (jamais aujourd'hui)
========================================================================= */

function pastDatesForCategory(catId) {
  const today = todayStr();
  const cat = store[catId] || {};
  return Object.keys(cat)
    .filter((d) => d < today)
    .sort((a, b) => (a < b ? 1 : -1));
}

function renderHistoryCatSeg() {
  const seg = document.getElementById("history-cat-seg");
  seg.innerHTML = CATEGORIES.map(
    (c) =>
      `<button data-cat="${c.id}" class="${c.id === historyCategory ? "active" : ""}">${c.label}</button>`,
  ).join("");
  seg.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      historyCategory = b.dataset.cat;
      renderHistoryCatSeg();
      renderHistoryDateSelect();
      renderHistoryDetail();
    }),
  );
}

function renderHistoryDateSelect() {
  const sel = document.getElementById("history-date-select");
  const dates = pastDatesForCategory(historyCategory);
  sel.innerHTML = dates
    .map((d) => `<option value="${d}">${formatDateLong(d)}</option>`)
    .join("");
  sel.onchange = renderHistoryDetail;
}

function renderHistoryDetail() {
  const dates = pastDatesForCategory(historyCategory);
  const emptyLead = document.getElementById("history-empty-lead");
  const controlsWrap = document.getElementById("history-controls-wrap");
  const body = document.getElementById("history-body");

  if (!dates.length) {
    emptyLead.hidden = false;
    controlsWrap.style.display = "none";
    body.style.display = "none";
    return;
  }
  emptyLead.hidden = true;
  controlsWrap.style.display = "";
  body.style.display = "";

  const sel = document.getElementById("history-date-select");
  const date = sel.value || dates[0];
  const day = getDay(historyCategory, date);
  const total = dayTotal(day);
  const max = Math.max(1, ...[1, 2, 3, 4, 5].map((v) => day.counts[v] || 0));
  const avg = dayAverage(day);
  const cat = CATEGORIES.find((c) => c.id === historyCategory);

  const filterNote = historyFilteredStore
    ? `<span class="hs-total">Filtré sur l&#39;identifiant ${escapeHtml(historyFilteredStore)}</span>`
    : "";

  document.getElementById("history-summary").innerHTML = `
    <div class="hs-head">
      <h4>${cat.label} — ${formatDateLong(date)}</h4>
      <span class="hs-total">${total} vote${total > 1 ? "s" : ""} · moyenne ${total ? avg.toFixed(2) : "—"} / 5</span>
      ${filterNote}
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

  const list = document.getElementById("comments-list");
  if (!day.comments.length) {
    list.innerHTML = `<div class="empty-state">Aucun commentaire laissé ce jour-là pour ce volet.</div>`;
  } else {
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

  document.getElementById("history-list").innerHTML = dates
    .map((d) => {
      const dDay = getDay(historyCategory, d);
      const dTotal = dayTotal(dDay);
      const segs = [1, 2, 3, 4, 5]
        .map((v) => {
          const pct = dTotal ? ((dDay.counts[v] || 0) / dTotal) * 100 : 0;
          return `<span class="hd-seg" style="width:${pct}%; background:${SCALE_COLORS[v]}" title="Note ${v} : ${dDay.counts[v] || 0}"></span>`;
        })
        .join("");
      return `<div class="hist-day">
        <span class="hd-date">${formatDateShort(d)}</span>
        <span class="hd-stack">${segs}</span>
        <span class="hd-total">${dTotal} vote${dTotal > 1 ? "s" : ""} · ${dDay.comments.length} com.</span>
      </div>`;
    })
    .join("");
}

function renderHistory() {
  renderYesterdayHero();
  renderYesterdayCats();
  renderHistoryDateSelect();
  renderHistoryDetail();
}

/* =========================================================================
   Onglet "Identifiants" — création et liste des identifiants votants
========================================================================= */

async function loadUsers() {
  const res = await fetch(USERS_URL, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401) {
    window.location.href = LOGIN_URL;
    return [];
  }
  if (!res.ok) throw new Error("bad status " + res.status);
  const payload = await res.json();
  return Array.isArray(payload.users) ? payload.users : [];
}

function formatDateTimeShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderUsersList() {
  const list = document.getElementById("users-list");
  if (!allUsers.length) {
    list.innerHTML = `<div class="empty-state">Aucun identifiant créé pour l&#39;instant.</div>`;
    return;
  }

  const todayVotesByUser = store._todayVotedByUser || {};

  list.innerHTML = allUsers
    .map((u) => {
      const todayCats = Array.isArray(todayVotesByUser[u.id])
        ? todayVotesByUser[u.id]
        : [];
      return `<div class="comment-card">
        <span class="cc-score" style="background:var(--blue)">${escapeHtml(u.id)}</span>
        <div style="flex:1;">
          <div class="cc-text">${u.label ? escapeHtml(u.label) : "<em>Sans étiquette</em>"}</div>
          <div class="cc-meta">Créé le ${formatDateTimeShort(u.created_at)}</div>
          <div class="cc-meta">${
            todayCats.length
              ? `A voté ${todayCats.length} volet${todayCats.length > 1 ? "s" : ""} aujourd&#39;hui (${escapeHtml(todayCats.join(", "))})`
              : "Aucun vote aujourd&#39;hui"
          }</div>
        </div>
        ${todayCats.length
          ? `<button type="button" class="btn-refresh btn-primary" data-user="${escapeHtml(u.id)}"><span>Réactiver aujourd&#39;hui</span></button>`
          : ""}
      </div>`;
    })
    .join("");

  list.querySelectorAll("button[data-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const userId = btn.dataset.user;
      showModal({
        title: "Réactiver le vote du jour",
        message: `Réinitialiser les votes d'aujourd'hui pour ${userId} afin qu'il puisse voter à nouveau ?`,
        confirmLabel: "Réactiver",
        cancelLabel: "Annuler",
        onConfirm: async () => {
          closeModal();
          await handleResetUserToday(userId);
        },
      });
    });
  });
}

function renderHistoryUserSelect() {
  const sel = document.getElementById("history-user-select");
  if (!sel) return;
  const previous = sel.value;
  sel.innerHTML =
    `<option value="">Tous les identifiants</option>` +
    allUsers
      .map(
        (u) =>
          `<option value="${escapeHtml(u.id)}">${escapeHtml(u.id)}${u.label ? " — " + escapeHtml(u.label) : ""}</option>`,
      )
      .join("");
  if (previous && allUsers.some((u) => u.id === previous)) sel.value = previous;
  sel.onchange = onHistoryUserChange;
}

async function onHistoryUserChange() {
  const sel = document.getElementById("history-user-select");
  const userId = sel.value;

  try {
    if (userId) {
      store = await loadData({ userId });
      historyFilteredStore = userId;
    } else {
      store = await loadData();
      historyFilteredStore = null;
    }
  } catch {
    store = {};
  }

  renderYesterdayHero();
  renderYesterdayCats();
  renderHistoryDateSelect();
  renderHistoryDetail();
}

async function refreshUsers() {
  try {
    allUsers = await loadUsers();
  } catch {
    allUsers = [];
  }
  renderUsersList();
  renderHistoryUserSelect();
}

async function handleResetUserToday(userId) {
  const btn = document.querySelector(`button[data-user="${userId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.classList.add("spinning");
  }

  try {
    const res = await fetch(`${USERS_URL}?id=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });

    if (res.status === 401) {
      window.location.href = LOGIN_URL;
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        data?.error || "Impossible de réactiver le vote pour cet utilisateur. Réessayez.";
      throw new Error(message);
    }

    await refresh();
    showToast(`Les votes d'aujourd'hui pour ${userId} ont été réinitialisés.`);
  } catch (err) {
    showModal({
      title: "Erreur",
      message: err.message || "Impossible de réactiver le vote pour cet utilisateur. Réessayez.",
      confirmLabel: "OK",
      onConfirm: closeModal,
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("spinning");
    }
  }
}

async function createUser() {
  const btn = document.getElementById("create-user-btn");
  const input = document.getElementById("new-user-label");
  btn.disabled = true;
  btn.classList.add("spinning");

  try {
    const res = await fetch(USERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: input.value.trim() }),
    });
    if (res.status === 401) {
      window.location.href = LOGIN_URL;
      return;
    }
    if (!res.ok) throw new Error("bad status " + res.status);
    const payload = await res.json();
    input.value = "";
    await refreshUsers();
    if (payload && payload.user) {
      showModal({
        title: "Identifiant créé",
        message: `Le nouvel identifiant est ${payload.user.id}. Communiquez-le à la personne concernée.`,
        confirmLabel: "OK",
        onConfirm: closeModal,
      });
    }
  } catch {
    showModal({
      title: "Erreur",
      message: "Impossible de créer l'identifiant pour le moment. Réessayez.",
      confirmLabel: "OK",
      onConfirm: closeModal,
    });
  } finally {
    btn.disabled = false;
    btn.classList.remove("spinning");
  }
}

/* =========================================================================
   Rendu global, onglets, modales, actions
========================================================================= */

function renderAll() {
  renderToday();
  renderHistory();
  renderArchived();
}

function initTabs() {
  const tabs = document.getElementById("admin-tabs");
  tabs.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs
        .querySelectorAll("button")
        .forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("tab-today").hidden = btn.dataset.tab !== "today";
      document.getElementById("tab-history").hidden =
        btn.dataset.tab !== "history";
      document.getElementById("tab-users").hidden = btn.dataset.tab !== "users";
      if (btn.dataset.tab === "users") refreshUsers();
      if (btn.dataset.tab === "archived") {
        loadArchived().then(renderArchived).catch(() => {});
      }
    });
  });
}

function closeModal() {
  const modal = document.getElementById("admin-modal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  modalState = null;
}

function showModal({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = null,
  onConfirm = null,
  onCancel = null,
}) {
  const modal = document.getElementById("admin-modal");
  const titleEl = document.getElementById("admin-modal-title");
  const messageEl = document.getElementById("admin-modal-message");
  const confirmBtn = document.getElementById("admin-modal-confirm");
  const cancelBtn = document.getElementById("admin-modal-cancel");
  const cancelWrap = cancelBtn.parentElement;

  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmLabel;

  if (cancelLabel) {
    cancelWrap.hidden = false;
    cancelBtn.textContent = cancelLabel;
  } else {
    cancelWrap.hidden = true;
  }

  modalState = { onConfirm, onCancel };
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

async function refresh() {
  const btn = document.getElementById("refresh-btn");
  btn.classList.add("spinning");
  store = await loadData(
    historyFilteredStore ? { userId: historyFilteredStore } : {},
  );
  await refreshUsers();
  await loadArchived();
  renderAll();
  setTimeout(() => btn.classList.remove("spinning"), 500);
}

async function loadArchived() {
  try {
    const res = await fetch(ARCHIVE_URL, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (res.status === 401) {
      window.location.href = LOGIN_URL;
      return [];
    }
    if (!res.ok) throw new Error("bad status " + res.status);
    const payload = await res.json();
    archivedItems = Array.isArray(payload.archived) ? payload.archived : [];
    return archivedItems;
  } catch {
    archivedItems = [];
    return archivedItems;
  }
}

function renderArchived() {
  const wrap = document.getElementById("archived-list");
  if (!wrap) return;
  if (!archivedItems.length) {
    wrap.innerHTML = `<div class="empty-state">Aucun vote archivé pour l'instant.</div>`;
    return;
  }

  wrap.innerHTML = archivedItems
    .map((a) => {
      const o = a.original || {};
      const user = o.user_id || "—";
      const cat = o.category || "—";
      const val = o.value || "—";
      const comment = o.comment ? escapeHtml(o.comment) : "";
      const when = a.archived_at ? formatDateTimeShort(a.archived_at) : "";
      return `<div class="comment-card">
        <span class="cc-score" style="background:var(--orange)">${escapeHtml(user)}</span>
        <div>
          <div class="cc-text">Volet: <strong>${escapeHtml(cat)}</strong> — Note: <strong>${escapeHtml(String(val))}</strong></div>
          <div class="cc-meta">Archivé le ${when}${comment ? " · Commentaire : " + comment : ""}</div>
        </div>
      </div>`;
    })
    .join("");
}

function resetData() {
  showModal({
    title: "Réinitialiser les données ?",
    message:
      "Cette action supprimera tous les votes et commentaires enregistrés, y compris l'historique. Les catégories et la logique de l'administration resteront intactes.",
    confirmLabel: "Confirmer",
    cancelLabel: "Annuler",
    onConfirm: handleResetConfirmed,
  });
}

async function handleResetConfirmed() {
  const btn = document.getElementById("reset-btn");
  btn.disabled = true;
  btn.classList.add("spinning");
  closeModal();

  let serverConfirmed = false;

  try {
    const res = await fetch(DATA_URL, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) {
      window.location.href = LOGIN_URL;
      return;
    }
    if (!res.ok) throw new Error("bad status " + res.status);

    const verify = await fetch(DATA_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (verify.ok) {
      const verifyData = await verify.json();
      const stillHasData =
        verifyData &&
        Object.keys(verifyData).some(
          (cat) => Object.keys(verifyData[cat] || {}).length > 0,
        );
      serverConfirmed = !stillHasData;
    }
  } catch {
    // Le backend peut être temporairement indisponible.
  }

  store = {};
  justReset = true;
  renderAll();

  if (serverConfirmed) {
    showModal({
      title: "Réinitialisation effectuée",
      message: "Toutes les données de votes et commentaires ont été effacées.",
      confirmLabel: "OK",
      onConfirm: closeModal,
    });
  } else {
    showModal({
      title: "Réinitialisation locale uniquement",
      message:
        "L'affichage a été vidé, mais le serveur n'a pas confirmé l'effacement. Les données pourraient réapparaître au prochain rafraîchissement. Vérifiez la configuration de la base de données.",
      confirmLabel: "Compris",
      onConfirm: closeModal,
    });
  }

  btn.disabled = false;
  btn.classList.remove("spinning");

  setTimeout(() => {
    justReset = false;
  }, 10000);
}

async function logout() {
  await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
  window.location.href = LOGIN_URL;
}

async function init() {
  initTabs();
  renderTodayCatSeg();
  renderHistoryCatSeg();

  try {
    store = await loadData();
  } catch {
    store = {};
  }
  try {
    allUsers = await loadUsers();
  } catch {
    allUsers = [];
  }
  await loadArchived();
  renderAll();
  renderUsersList();
  renderHistoryUserSelect();

  document.getElementById("refresh-btn").addEventListener("click", refresh);
  document.getElementById("reset-btn").addEventListener("click", resetData);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document
    .getElementById("create-user-btn")
    .addEventListener("click", createUser);
  document
    .getElementById("admin-modal-confirm")
    .addEventListener("click", () => {
      if (modalState?.onConfirm) {
        modalState.onConfirm();
      } else {
        closeModal();
      }
    });
  document
    .getElementById("admin-modal-cancel")
    .addEventListener("click", () => {
      if (modalState?.onCancel) {
        modalState.onCancel();
      } else {
        closeModal();
      }
    });
  document.getElementById("admin-modal").addEventListener("click", (event) => {
    if (event.target.id === "admin-modal") closeModal();
  });

  setInterval(() => {
    if (justReset) return;
    loadData(historyFilteredStore ? { userId: historyFilteredStore } : {})
      .then((d) => {
        store = d;
        renderAll();
      })
      .catch(() => {});
  }, 30000);
}

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerHTML = `<span class="dot"></span> ${msg}`;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

init();
