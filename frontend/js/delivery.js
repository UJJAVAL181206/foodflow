/* =========================================================================
   FoodFlow - delivery.html logic (delivery partner)
   ========================================================================= */

const STATUS_FLOW = ["PLACED", "CONFIRMED", "PREPARING", "READY", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"];
let locationInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  if (!Session.isLoggedIn() || Session.role !== "delivery") {
    toast("Please log in as a delivery partner first.", "warning");
    window.location.href = "index.html";
    return;
  }
  const profile = Session.profile;
  document.getElementById("dp-greeting").textContent = `Welcome, ${profile.name.split(" ")[0]} 🚴`;
  document.getElementById("availability-toggle").checked = !!profile.available;
  document.getElementById("availability-label").textContent = profile.available ? "Online" : "Offline";
  loadDpOverview();
  loadDpOrders();
});

function switchDpTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `dp-tab-${name}`));
  const loaders = { orders: loadDpOrders, earnings: loadEarnings, reviews: loadDpReviews, activity: loadDpActivity, profile: loadDpProfile };
  if (loaders[name]) loaders[name]();
}

async function setAvailability(checked) {
  try {
    await apiRequest("/delivery/availability", { method: "PUT", body: { available: checked } });
    document.getElementById("availability-label").textContent = checked ? "Online" : "Offline";
    toast(checked ? "You are now online and can receive delivery requests." : "You are now offline.", "success");
  } catch (err) { toast(err.message, "error"); }
}

async function loadDpOverview() {
  try {
    const e = await apiRequest("/delivery/earnings");
    document.getElementById("dp-earnings").textContent = currency(e.total_earnings);
    document.getElementById("dp-deliveries").textContent = e.total_deliveries;
    document.getElementById("dp-rating").textContent = `${e.rating} ⭐`;
  } catch (err) { toast(err.message, "error"); }
}

async function loadDpOrders() {
  try {
    const orders = await apiRequest("/delivery/orders");
    document.getElementById("dp-active").textContent = orders.length;
    const list = document.getElementById("dp-orders-list");
    list.innerHTML = orders.length ? orders.map(dpOrderCard).join("") : `<div class="empty-state"><i>📦</i>No active delivery requests right now. Go online to receive new orders.</div>`;
  } catch (err) { toast(err.message, "error"); }
}

function dpOrderCard(o) {
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(o.status) + 1];
  return `<div class="card" style="padding:16px;margin-bottom:12px;">
    <div class="card-row"><strong>${o.order_id}</strong><span class="tag">${o.status}</span></div>
    <div class="muted" style="font-size:13px;">Customer: ${escapeHtml(o.customer_name)}</div>
    <div class="muted" style="font-size:13px;">Address: ${escapeHtml(o.address)}</div>
    <div class="muted" style="font-size:13px;">${o.items_summary.join(", ")}</div>
    ${o.special_instructions ? `<div class="muted" style="font-size:12px;">Note: ${escapeHtml(o.special_instructions)}</div>` : ""}
    <div class="card-row"><span>Order amount</span><strong>${currency(o.total)}</strong></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      ${o.status === "PLACED" ? `
        <button class="btn btn-primary btn-sm" onclick="acceptOrder('${o.order_id}')">Accept</button>
        <button class="btn btn-danger btn-sm" onclick="rejectOrder('${o.order_id}')">Reject</button>` : ""}
      ${nextStatus ? `<button class="btn btn-outline btn-sm" onclick="advanceStatus('${o.order_id}','${nextStatus}')">Mark as ${nextStatus.replace(/_/g, " ")}</button>` : ""}
      ${["PICKED_UP", "OUT_FOR_DELIVERY"].includes(o.status) ? `<button class="btn btn-ghost btn-sm" onclick="shareLocation('${o.order_id}')">📍 Share Location</button>` : ""}
    </div>
  </div>`;
}

async function acceptOrder(id) {
  try { await apiRequest(`/delivery/orders/${id}/accept`, { method: "POST" }); toast("Order accepted.", "success"); loadDpOrders(); }
  catch (err) { toast(err.message, "error"); }
}
async function rejectOrder(id) {
  confirmAction("Reject this delivery request?", async () => {
    try { await apiRequest(`/delivery/orders/${id}/reject`, { method: "POST" }); toast("Order reassigned.", "success"); loadDpOrders(); }
    catch (err) { toast(err.message, "error"); }
  });
}
async function advanceStatus(id, status) {
  try {
    await apiRequest(`/delivery/orders/${id}/status`, { method: "PUT", body: { status } });
    toast(`Order marked as ${status.replace(/_/g, " ")}.`, "success");
    loadDpOrders(); loadDpOverview();
  } catch (err) { toast(err.message, "error"); }
}

function shareLocation(orderId) {
  if (!navigator.geolocation) { toast("Geolocation is not supported on this device.", "error"); return; }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      await apiRequest("/delivery/location", { method: "POST", body: { order_id: orderId, latitude: pos.coords.latitude, longitude: pos.coords.longitude } });
      toast("Location shared with customer.", "success");
    } catch (err) { toast(err.message, "error"); }
  }, () => toast("Location permission denied.", "warning"));
}

async function loadEarnings() {
  try {
    const e = await apiRequest("/delivery/earnings");
    const table = document.getElementById("earnings-table");
    table.innerHTML = `<tr><th>Order</th><th>Total</th><th>Your Earning</th><th>Delivered</th></tr>` +
      e.recent_deliveries.map(d => `<tr><td>${d.order_id}</td><td>${currency(d.total)}</td><td>${currency(d.earning)}</td><td>${timeAgo(d.delivered_at)}</td></tr>`).join("");
  } catch (err) { toast(err.message, "error"); }
}

async function loadDpReviews() {
  try {
    const reviews = await apiRequest("/delivery/reviews");
    document.getElementById("dp-reviews-list").innerHTML = reviews.length ? reviews.map(r => `
      <div class="card" style="padding:14px;margin-bottom:8px;">
        <strong>⭐ ${r.delivery_rating}</strong> <span class="muted" style="font-size:12px;">${timeAgo(r.created_at)}</span>
        <p style="margin:4px 0 0;">${escapeHtml(r.text || "")}</p>
      </div>`).join("") : `<div class="empty-state">No reviews yet.</div>`;
  } catch (err) { toast(err.message, "error"); }
}

async function loadDpActivity() {
  try {
    const activity = await apiRequest("/delivery/activity");
    document.getElementById("dp-activity-timeline").innerHTML = activity.length ? activity.map(a => `<li class="done"><strong>${a.activity_type.replace(/_/g, " ")}</strong><div class="muted" style="font-size:12px;">${timeAgo(a.created_at)}</div></li>`).join("") : `<div class="empty-state">No activity yet.</div>`;
  } catch (err) { toast(err.message, "error"); }
}

function loadDpProfile() {
  const p = Session.profile;
  document.getElementById("dp-name").value = p.name;
  document.getElementById("dp-phone").value = p.phone;
  document.getElementById("dp-vehicle").value = `${p.vehicle_type} · ${p.vehicle_number || ""}`;
}
