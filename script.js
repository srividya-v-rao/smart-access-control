/* =====================================================
   Smart Access Control - script.js
   DEMO MODE: no real hardware communication happens.
   ===================================================== */

/* ---------- 1. CONFIG ---------- */
const CONFIG = {
  DEMO_MODE: true,                 // set to false when the Pi is ready
  PI_BASE_URL: "",                 // e.g. "http://192.168.1.50:5000"  (future)
  API_TOKEN: "",                   // secret token shared with the Pi   (future)
  STORAGE_KEY_HISTORY: "sac_history_v1",
  STORAGE_KEY_DOOR: "sac_door_v1",
  MAX_HISTORY: 50,
};

/* ---------- 2. DEVICE API LAYER ----------
   The UI only talks to these three functions.
   Today they are simulated. Later, replace the simulated
   branch with real fetch() calls (see notes at the bottom). */
const DeviceAPI = {
  simulatedOnline: true,

  async checkConnection() {
    if (CONFIG.DEMO_MODE) {
      await delay(600);
      return this.simulatedOnline;
    }
    // FUTURE: real check
    // const res = await fetch(`${CONFIG.PI_BASE_URL}/status`, { headers: authHeaders() });
    // return res.ok;
    return false;
  },

  async openDoor() {
    if (CONFIG.DEMO_MODE) {
      await delay(700);
      if (!this.simulatedOnline) throw new Error("Raspberry Pi is offline (simulated)");
      return { ok: true };
    }
    // FUTURE: real command
    // const res = await fetch(`${CONFIG.PI_BASE_URL}/open`, { method: "POST", headers: authHeaders() });
    // if (!res.ok) throw new Error("Pi rejected the command");
    // return res.json();
    throw new Error("Real mode not implemented yet");
  },

  async lockDoor() {
    if (CONFIG.DEMO_MODE) {
      await delay(500);
      if (!this.simulatedOnline) throw new Error("Raspberry Pi is offline (simulated)");
      return { ok: true };
    }
    // FUTURE: real command (may not be needed if the Pi auto-relocks)
    throw new Error("Real mode not implemented yet");
  },
};

/* ---------- 3. HELPERS ---------- */
const $ = (id) => document.getElementById(id);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function authHeaders() {
  return { "Authorization": "Bearer " + CONFIG.API_TOKEN, "Content-Type": "application/json" };
}

function safeGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- 4. STATE ---------- */
let doorLocked = safeGet(CONFIG.STORAGE_KEY_DOOR, true);
let history = safeGet(CONFIG.STORAGE_KEY_HISTORY, []);
let busy = false;
let lastChecked = null;

/* ---------- 5. TOAST ---------- */
let toastTimer;
function toast(message, type = "success") {
  const t = $("toast");
  t.textContent = message;
  t.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 2600);
}

/* ---------- 6. RENDERING ---------- */
function renderDoor() {
  $("door-card").dataset.state = doorLocked ? "locked" : "unlocked";
  $("door-status").textContent = doorLocked ? "LOCKED" : "UNLOCKED";
  $("door-sub").textContent = doorLocked ? "Your door is secure." : "Door is open (demo).";
  $("open-btn").disabled = busy || !doorLocked;
  $("lock-btn").disabled = busy || doorLocked;
}

function renderConnection() {
  const online = DeviceAPI.simulatedOnline;
  const label = online ? "Pi Online (simulated)" : "Pi Offline (simulated)";

  $("conn-pill").className = "pill " + (online ? "pill-online" : "pill-offline");
  $("conn-pill-text").textContent = label;
  $("home-pi").textContent = online ? "Online (simulated)" : "Offline (simulated)";

  $("device-pill").className = "pill " + (online ? "pill-online" : "pill-offline");
  $("device-pill").innerHTML = '<span class="dot"></span>' + (online ? "Online" : "Offline");
  $("device-text").textContent = online ? "Simulated connection is healthy" : "Simulated connection lost";
  $("device-address").textContent = CONFIG.PI_BASE_URL || "Not configured";
  $("device-checked").textContent = lastChecked ? formatTime(lastChecked) : "\u2014";
  $("toggle-conn-btn").textContent = online ? "Simulate Offline" : "Simulate Online";
}

const ICON_OPEN = '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

function historyItemHtml(item) {
  const isOpen = item.type === "open";
  return `
    <li class="history-item">
      <span class="h-icon ${isOpen ? "open" : "lock"}">${isOpen ? ICON_OPEN : ICON_LOCK}</span>
      <span class="h-text">
        <strong>${isOpen ? "Door opened manually" : "Door locked manually"}</strong>
        <small>${escapeHtml(formatTime(item.time))} &middot; Demo</small>
      </span>
    </li>`;
}

function renderHistory() {
  const list = $("history-list");
  list.innerHTML = history.map(historyItemHtml).join("");
  $("history-empty").hidden = history.length > 0;
  $("clear-btn").disabled = history.length === 0;

  $("home-recent").innerHTML = history.length
    ? history.slice(0, 3).map(historyItemHtml).join("")
    : '<li class="muted tiny">No activity yet.</li>';

  $("home-last").textContent = history.length
    ? (history[0].type === "open" ? "Opened" : "Locked") + " \u00b7 " + formatTime(history[0].time)
    : "None yet";
}

function renderAll() {
  renderDoor();
  renderConnection();
  renderHistory();
}

/* ---------- 7. ACTIONS ---------- */
function addHistory(type) {
  history.unshift({ type, time: Date.now() });
  history = history.slice(0, CONFIG.MAX_HISTORY);
  safeSet(CONFIG.STORAGE_KEY_HISTORY, history);
}

async function handleOpen() {
  if (busy) return;
  busy = true;
  $("open-btn").textContent = "Sending command...";
  renderDoor();
  try {
    await DeviceAPI.openDoor();
    doorLocked = false;
    safeSet(CONFIG.STORAGE_KEY_DOOR, doorLocked);
    addHistory("open");
    toast("Door unlocked (demo mode)", "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    busy = false;
    $("open-btn").innerHTML = ICON_OPEN + " Open Door";
    renderAll();
  }
}

async function handleLock() {
  if (busy) return;
  busy = true;
  renderDoor();
  try {
    await DeviceAPI.lockDoor();
    doorLocked = true;
    safeSet(CONFIG.STORAGE_KEY_DOOR, doorLocked);
    addHistory("lock");
    toast("Door locked (demo mode)", "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    busy = false;
    renderAll();
  }
}

async function handleCheck() {
  const btn = $("check-btn");
  btn.disabled = true;
  btn.textContent = "Checking...";
  try {
    const ok = await DeviceAPI.checkConnection();
    lastChecked = Date.now();
    toast(ok ? "Pi reachable (simulated)" : "Pi not reachable (simulated)", ok ? "success" : "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Check Connection";
    renderConnection();
  }
}

function handleToggleConn() {
  DeviceAPI.simulatedOnline = !DeviceAPI.simulatedOnline;
  lastChecked = Date.now();
  renderConnection();
  toast(DeviceAPI.simulatedOnline ? "Simulated: Pi online" : "Simulated: Pi offline", "success");
}

function handleClear() {
  if (!history.length) return;
  if (confirm("Clear all access history?")) {
    history = [];
    safeSet(CONFIG.STORAGE_KEY_HISTORY, history);
    renderHistory();
    toast("History cleared", "success");
  }
}

/* ---------- 8. NAVIGATION ---------- */
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  window.scrollTo({ top: 0 });
}

document.querySelectorAll("[data-view]").forEach((el) =>
  el.addEventListener("click", () => showView(el.dataset.view))
);

$("open-btn").addEventListener("click", handleOpen);
$("lock-btn").addEventListener("click", handleLock);
$("check-btn").addEventListener("click", handleCheck);
$("toggle-conn-btn").addEventListener("click", handleToggleConn);
$("clear-btn").addEventListener("click", handleClear);

/* ---------- 9. START ---------- */
renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((e) => console.warn("SW failed", e));
  });
}

/* =====================================================
   FUTURE: REAL RASPBERRY PI INTEGRATION (notes)

   Idea: run a tiny web server on the Pi (e.g. Python Flask).
   Endpoints:
     GET  /status  -> { "online": true }
     POST /open    -> triggers the relay for ~5 seconds, then relocks

   Security (important - do NOT skip):
   1. Require a secret token: the app sends
      "Authorization: Bearer <long random token>", the Pi rejects anything else.
   2. Keep it on your home Wi-Fi only. Do NOT port-forward the Pi to the internet.
      If remote access is needed later, use a VPN such as Tailscale (free personal plan).
   3. Use HTTPS if possible. Browsers block an HTTPS page (like a hosted PWA)
      from calling plain http:// devices ("mixed content"), so either serve the
      app from the Pi itself over the same protocol, or add HTTPS to the Pi.
   4. Add a rate limit and log every request on the Pi.
   5. Never hard-code a real token in a public GitHub repo.

   Pi side needs CORS enabled if the app is served from a different address.
   Then: set CONFIG.DEMO_MODE = false, fill PI_BASE_URL and API_TOKEN,
   and uncomment the fetch() calls inside DeviceAPI.
   ===================================================== */
