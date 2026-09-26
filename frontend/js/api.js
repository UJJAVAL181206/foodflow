/* =========================================================================
   FoodFlow - Shared frontend helpers
   API request wrapper, auth/session storage, toast system, modal helpers,
   dark mode. Loaded on every page before the page-specific script.
   ========================================================================= */

const API_BASE = "http://localhost:5000/api";

/* ---- Session storage (per role) ---------------------------------------- */
const Session = {
  get token() { return localStorage.getItem("ff_token"); },
  get role() { return localStorage.getItem("ff_role"); },
  get profile() {
    try { return JSON.parse(localStorage.getItem("ff_profile") || "null"); }
    catch { return null; }
  },
  save(token, role, profile) {
    localStorage.setItem("ff_token", token);
    localStorage.setItem("ff_role", role);
    localStorage.setItem("ff_profile", JSON.stringify(profile));
  },
  clear() {
    localStorage.removeItem("ff_token");
    localStorage.removeItem("ff_role");
    localStorage.removeItem("ff_profile");
  },
  isLoggedIn() { return !!this.token; },
};

/* ---- API wrapper --------------------------------------------------------- */
async function apiRequest(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && Session.token) headers["Authorization"] = `Bearer ${Session.token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Something went wrong.");
    }
    return data;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("Unable to reach the FoodFlow server. Is the Flask backend running?");
    }
    throw err;
  }
}

/* ---- Toast system --------------------------------------------------------- */
function ensureToastContainer() {
  let c = document.getElementById("toast-container");
  if (!c) {
    c = document.createElement("div");
    c.id = "toast-container";
    document.body.appendChild(c);
  }
  return c;
}

function toast(message, type = "info") {
  const c = ensureToastContainer();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const icons = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };
  el.textContent = `${icons[type] || ""} ${message}`;
  c.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ---- Modal helpers -------------------------------------------------------- */
function openModal(id) { document.getElementById(id)?.classList.add("show"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("show"); }
document.addEventListener("click", (e) => {
  if (e.target.classList?.contains("modal-overlay")) e.target.classList.remove("show");
});

/* ---- Confirmation modal (replaces browser confirm()) ---------------------- */
function confirmAction(message, onConfirm) {
  let modal = document.getElementById("confirm-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "confirm-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal" style="max-width:360px;text-align:center;">
        <p id="confirm-message" style="font-size:15px;margin-bottom:20px;"></p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
          <button class="btn btn-danger" id="confirm-ok">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.querySelector("#confirm-message").textContent = message;
  modal.classList.add("show");
  const okBtn = modal.querySelector("#confirm-ok");
  const cancelBtn = modal.querySelector("#confirm-cancel");
  const cleanup = () => { modal.classList.remove("show"); okBtn.onclick = null; cancelBtn.onclick = null; };
  okBtn.onclick = () => { cleanup(); onConfirm(); };
  cancelBtn.onclick = cleanup;
}

/* ---- Button ripple effect --------------------------------------------------- */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn");
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.left = `${e.clientX - rect.left}px`;
  ripple.style.top = `${e.clientY - rect.top}px`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
});

/* ---- Dark mode -------------------------------------------------------------- */
function initTheme() {
  const saved = localStorage.getItem("ff_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("ff_theme", next);
}
initTheme();

/* ---- Logout (shared across role dashboards) --------------------------------- */
async function logout(redirectTo = "index.html") {
  try { await apiRequest(Session.role === "delivery" ? "/auth/logout" : "/auth/logout", { method: "POST" }); }
  catch { /* ignore network errors on logout */ }
  Session.clear();
  window.location.href = redirectTo;
}

/* ---- Small utils -------------------------------------------------------------- */
function currency(n) { return `₹${Number(n || 0).toFixed(0)}`; }
function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
