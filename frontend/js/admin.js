/* =========================================================================
   FoodFlow - admin.html logic
   ========================================================================= */

document.addEventListener("DOMContentLoaded", () => {
  if (Session.isLoggedIn() && Session.role === "admin") showAdminPanel();
});

async function adminLogin() {
  try {
    const data = await apiRequest("/admin/login", {
      method: "POST", auth: false,
      body: { identifier: document.getElementById("admin-email").value, password: document.getElementById("admin-password").value },
    });
    Session.save(data.token, "admin", data.admin);
    toast(`Welcome, ${data.admin.name}`, "success");
    showAdminPanel();
  } catch (err) { toast(err.message, "error"); }
}

function showAdminPanel() {
  document.getElementById("admin-login-gate").style.display = "none";
  document.getElementById("admin-panel").style.display = "block";
  loadAnalytics();
  loadUsers();
}

function switchAdminTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `admin-tab-${name}`));
  const loaders = {
    users: loadUsers, partners: loadPartners, restaurants: loadRestaurantsAdmin,
    orders: () => loadAdminOrders(""), reviews: () => loadAdminReviews(false),
    coupons: loadCoupons, rescue: loadRescueAdmin,
  };
  if (loaders[name]) loaders[name]();
}

async function loadAnalytics() {
  try {
    const a = await apiRequest("/admin/analytics");
    document.getElementById("a-users").textContent = a.total_users;
    document.getElementById("a-orders").textContent = a.total_orders;
    document.getElementById("a-revenue").textContent = currency(a.total_revenue);
    document.getElementById("a-restaurants").textContent = a.total_restaurants;
    document.getElementById("a-partners").textContent = a.total_delivery_partners;
    document.getElementById("a-active").textContent = a.active_deliveries;
  } catch (err) { toast(err.message, "error"); }
}

/* ---- USERS ------------------------------------------------------------------ */
async function loadUsers(q = "") {
  try {
    const users = await apiRequest(`/admin/users${q ? "?q=" + encodeURIComponent(q) : ""}`);
    document.getElementById("users-table").innerHTML = `<tr><th>Name</th><th>Email</th><th>Status</th><th></th></tr>` +
      users.map(u => `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td>
        <td>${u.blocked ? "🚫 Blocked" : "✅ Active"}</td>
        <td><button class="btn btn-sm ${u.blocked ? "btn-outline" : "btn-danger"}" onclick="toggleBlockUser('${u.user_id}', ${!u.blocked})">${u.blocked ? "Unblock" : "Block"}</button></td></tr>`).join("");
  } catch (err) { toast(err.message, "error"); }
}
function searchUsers(q) { loadUsers(q); }
async function toggleBlockUser(id, block) {
  try { await apiRequest(`/admin/users/${id}/block`, { method: "PUT", body: { blocked: block } }); loadUsers(); }
  catch (err) { toast(err.message, "error"); }
}

/* ---- DELIVERY PARTNERS -------------------------------------------------------- */
async function loadPartners() {
  try {
    const partners = await apiRequest("/admin/delivery-partners");
    document.getElementById("partners-table").innerHTML = `<tr><th>Name</th><th>Vehicle</th><th>Rating</th><th>Status</th><th></th></tr>` +
      partners.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.vehicle_type)}</td><td>⭐ ${p.rating}</td>
        <td>${p.blocked ? "🚫 Blocked" : "✅ Active"}</td>
        <td><button class="btn btn-sm ${p.blocked ? "btn-outline" : "btn-danger"}" onclick="toggleBlockPartner('${p.delivery_partner_id}', ${!p.blocked})">${p.blocked ? "Unblock" : "Block"}</button></td></tr>`).join("");
  } catch (err) { toast(err.message, "error"); }
}
async function toggleBlockPartner(id, block) {
  try { await apiRequest(`/admin/delivery-partners/${id}/block`, { method: "PUT", body: { blocked: block } }); loadPartners(); }
  catch (err) { toast(err.message, "error"); }
}

/* ---- RESTAURANTS & FOODS -------------------------------------------------------- */
async function loadRestaurantsAdmin() {
  try {
    const restaurants = await apiRequest("/admin/restaurants");
    document.getElementById("restaurants-table").innerHTML = `<tr><th>Name</th><th>Cuisine</th><th>Rating</th></tr>` +
      restaurants.map(r => `<tr><td>${escapeHtml(r.name)} <span class="muted" style="font-size:11px;">(${r.restaurant_id})</span></td><td>${escapeHtml(r.cuisine)}</td><td>⭐ ${r.rating}</td></tr>`).join("");
  } catch (err) { toast(err.message, "error"); }
}
async function addRestaurant() {
  try {
    await apiRequest("/admin/restaurants", { method: "POST", body: { name: document.getElementById("r-name").value, cuisine: document.getElementById("r-cuisine").value, delivery_time: Number(document.getElementById("r-time").value) } });
    closeModal("add-restaurant-modal"); toast("Restaurant added.", "success"); loadRestaurantsAdmin();
  } catch (err) { toast(err.message, "error"); }
}
async function addFood() {
  try {
    await apiRequest("/admin/foods", { method: "POST", body: { restaurant_id: document.getElementById("f-restaurant-id").value, name: document.getElementById("f-name").value, price: Number(document.getElementById("f-price").value), food_type: document.getElementById("f-type").value } });
    closeModal("add-food-modal"); toast("Food item added.", "success");
  } catch (err) { toast(err.message, "error"); }
}

/* ---- ORDERS --------------------------------------------------------------------- */
async function loadAdminOrders(status) {
  try {
    const orders = await apiRequest(`/admin/orders${status ? "?status=" + status : ""}`);
    document.getElementById("orders-table").innerHTML = `<tr><th>Order ID</th><th>Total</th><th>Status</th><th>Date</th></tr>` +
      orders.map(o => `<tr><td>${o.order_id}</td><td>${currency(o.total)}</td><td>${o.status}</td><td>${timeAgo(o.created_at)}</td></tr>`).join("");
  } catch (err) { toast(err.message, "error"); }
}

/* ---- REVIEWS ------------------------------------------------------------------------ */
async function loadAdminReviews(reportedOnly) {
  try {
    const reviews = await apiRequest(`/admin/reviews${reportedOnly ? "?reported=true" : ""}`);
    document.getElementById("admin-reviews-list").innerHTML = reviews.length ? reviews.map(r => `
      <div class="card" style="padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <div><strong>⭐ ${r.food_rating}</strong> <span class="muted" style="font-size:12px;">${timeAgo(r.created_at)}</span>
        <p style="margin:4px 0 0;">${escapeHtml(r.text || "")}</p></div>
        <button class="btn btn-danger btn-sm" onclick="deleteReview('${r.review_id}')">Delete</button>
      </div>`).join("") : `<div class="empty-state">No reviews found.</div>`;
  } catch (err) { toast(err.message, "error"); }
}
async function deleteReview(id) {
  confirmAction("Delete this review permanently?", async () => {
    try { await apiRequest(`/admin/reviews/${id}`, { method: "DELETE" }); toast("Review deleted.", "success"); loadAdminReviews(false); }
    catch (err) { toast(err.message, "error"); }
  });
}

/* ---- COUPONS ------------------------------------------------------------------------- */
async function loadCoupons() {
  try {
    const coupons = await apiRequest("/admin/coupons");
    document.getElementById("coupons-table").innerHTML = `<tr><th>Code</th><th>Type</th><th>Value</th></tr>` +
      coupons.map(c => `<tr><td>${c.code}</td><td>${c.type}</td><td>${c.value}</td></tr>`).join("");
  } catch (err) { toast(err.message, "error"); }
}
async function addCoupon() {
  try {
    await apiRequest("/admin/coupons", { method: "POST", body: { code: document.getElementById("c-code").value, type: document.getElementById("c-type").value, value: Number(document.getElementById("c-value").value) } });
    closeModal("add-coupon-modal"); toast("Coupon added.", "success"); loadCoupons();
  } catch (err) { toast(err.message, "error"); }
}

/* ---- FOOD RESCUE ---------------------------------------------------------------------- */
async function loadRescueAdmin() {
  try {
    const items = await apiRequest("/food-rescue", { auth: false });
    document.getElementById("admin-rescue-list").innerHTML = items.length ? items.map(i => `
      <div class="card"><div class="card-body">
        <strong>${escapeHtml(i.food_name)}</strong>
        <div class="muted">${i.portions_left} portions left</div>
        <div class="card-row"><span style="text-decoration:line-through;" class="muted">${currency(i.normal_price)}</span><strong>${currency(i.rescue_price)}</strong></div>
      </div></div>`).join("") : `<div class="empty-state">No active Food Rescue listings.</div>`;
  } catch (err) { toast(err.message, "error"); }
}
async function addRescue() {
  try {
    await apiRequest("/food-rescue", {
      method: "POST",
      body: {
        restaurant_id: document.getElementById("fr-restaurant-id").value,
        food_name: document.getElementById("fr-name").value,
        normal_price: Number(document.getElementById("fr-normal").value),
        rescue_price: Number(document.getElementById("fr-rescue").value),
        portions_left: Number(document.getElementById("fr-portions").value),
        available_until: new Date(document.getElementById("fr-until").value).toISOString(),
      },
    });
    closeModal("add-rescue-modal"); toast("Food Rescue listing added.", "success"); loadRescueAdmin();
  } catch (err) { toast(err.message, "error"); }
}
