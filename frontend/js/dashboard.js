/* =========================================================================
   FoodFlow - dashboard.html logic (customer)
   ========================================================================= */

document.addEventListener("DOMContentLoaded", () => {
  if (!Session.isLoggedIn() || Session.role !== "customer") {
    toast("Please log in as a customer first.", "warning");
    window.location.href = "index.html";
    return;
  }
  const profile = Session.profile;
  document.getElementById("dash-greeting").textContent = `Good day, ${profile.name.split(" ")[0]} 👋`;

  const hash = window.location.hash.replace("#", "");
  switchTab(hash || "overview");
  loadOverview();
  refreshBadges();
});

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `tab-${name}`));
  const loaders = {
    overview: loadOverview, cart: loadCart, orders: loadOrders, favorites: loadFavorites,
    preferences: loadPreferences, addresses: loadAddresses, rewards: loadRewards,
    budget: loadBudget, nutrition: loadNutrition, activity: loadActivity,
    notifications: loadNotifications, profile: loadProfile,
  };
  if (loaders[name]) loaders[name]();
}

async function refreshBadges() {
  try {
    const notifs = await apiRequest("/notifications");
    const unread = notifs.filter(n => !n.read).length;
    const nb = document.getElementById("notif-badge");
    nb.style.display = unread ? "flex" : "none"; nb.textContent = unread;
    const cartItems = await apiRequest("/cart");
    const cb = document.getElementById("cart-badge");
    cb.style.display = cartItems.length ? "flex" : "none"; cb.textContent = cartItems.length;
  } catch { /* ignore */ }
}

/* ---- OVERVIEW ------------------------------------------------------------- */
async function loadOverview() {
  try {
    const [rewards, budget, orders] = await Promise.all([
      apiRequest("/rewards"), apiRequest("/budget"), apiRequest("/orders"),
    ]);
    document.getElementById("ov-points").textContent = rewards.points;
    document.getElementById("ov-wallet").textContent = currency(Session.profile.wallet_balance);
    document.getElementById("ov-spend").textContent = currency(budget.spent_today);
    document.getElementById("ov-active").textContent = orders.filter(o => !["DELIVERED", "CANCELLED"].includes(o.status)).length;

    const recs = await apiRequest("/recommendations");
    document.getElementById("ov-recommended").innerHTML = recs.map(dashFoodCard).join("") || `<div class="empty-state">No recommendations yet — place your first order!</div>`;
  } catch (err) { toast(err.message, "error"); }
}

function dashFoodCard(f) {
  return `<div class="card">
    <div class="card-img-wrap" style="display:flex;align-items:center;justify-content:center;font-size:44px;">🍽️</div>
    <div class="card-body">
      <div class="card-row"><span class="rating-pill">⭐ ${f.rating}</span><span class="tag">${escapeHtml(f.food_type)}</span></div>
      <div class="card-title">${escapeHtml(f.name)}</div>
      <div class="card-sub">${f.calories} kcal · ${f.protein}g protein</div>
      <div class="card-row"><strong>${currency(f.price)}</strong></div>
      <button class="btn btn-primary btn-block btn-sm" onclick="addToCart('${f.food_id}')">Add to Cart</button>
    </div></div>`;
}

async function addToCart(foodId) {
  try { await apiRequest("/cart", { method: "POST", body: { food_id: foodId, quantity: 1 } }); toast("Added to cart", "success"); refreshBadges(); }
  catch (err) { toast(err.message, "error"); }
}

/* ---- CART & CHECKOUT -------------------------------------------------------- */
async function loadCart() {
  try {
    const items = await apiRequest("/cart");
    const container = document.getElementById("cart-items");
    if (!items.length) {
      container.innerHTML = `<div class="empty-state"><i>🛒</i>No items in your cart yet.</div>`;
      document.getElementById("cart-summary").innerHTML = "";
      return;
    }
    container.innerHTML = items.map(i => `
      <div class="card" style="display:flex;flex-direction:row;align-items:center;padding:14px;margin-bottom:10px;gap:14px;">
        <div style="font-size:32px;">🍽️</div>
        <div style="flex:1;">
          <strong>${escapeHtml(i.food_name)}</strong>
          <div class="muted" style="font-size:12px;">${currency(i.unit_price)} each · ${i.calories} kcal · ${i.protein}g protein</div>
        </div>
        <input type="number" min="1" value="${i.quantity}" style="width:60px;padding:6px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);"
          onchange="updateCartQty('${i.cart_item_id}', this.value)">
        <strong>${currency(i.unit_price * i.quantity)}</strong>
        <button class="btn btn-ghost btn-sm" onclick="removeCartItem('${i.cart_item_id}')">Remove</button>
      </div>`).join("");

    const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const calories = items.reduce((s, i) => s + i.calories * i.quantity, 0);
    const protein = items.reduce((s, i) => s + i.protein * i.quantity, 0);
    document.getElementById("cart-summary").innerHTML = `
      <div class="stat-card">
        <div class="card-row"><span>Subtotal</span><span>${currency(subtotal)}</span></div>
        <div class="card-row muted"><span>Delivery + Platform Fee</span><span>₹35</span></div>
        <div class="card-row muted"><span>Nutrition</span><span>${calories} kcal · ${protein}g protein</span></div>
        <hr style="border-color:var(--border);">
        <div class="card-row"><strong>Estimated Total</strong><strong>${currency(subtotal + 35)}</strong></div>
        <button class="btn btn-primary btn-block" onclick="openCheckout()">Proceed to Checkout</button>
      </div>`;
  } catch (err) { toast(err.message, "error"); }
}

async function updateCartQty(id, qty) {
  try { await apiRequest(`/cart/${id}`, { method: "PUT", body: { quantity: Number(qty) } }); loadCart(); refreshBadges(); }
  catch (err) { toast(err.message, "error"); }
}
async function removeCartItem(id) {
  try { await apiRequest(`/cart/${id}`, { method: "DELETE" }); toast("Removed from cart", "success"); loadCart(); refreshBadges(); }
  catch (err) { toast(err.message, "error"); }
}

async function openCheckout() {
  try {
    const addresses = await apiRequest("/users/addresses");
    document.getElementById("checkout-body").innerHTML = `
      <div class="form-group"><label>Delivery Address</label>
        <select id="checkout-address">${addresses.length ? addresses.map(a => `<option value="${escapeHtml(a.text)}">${escapeHtml(a.label)}: ${escapeHtml(a.text)}</option>`).join("") : `<option value="">No saved address — add one first</option>`}</select>
      </div>
      <div class="form-group"><label>Coupon Code (optional)</label><input type="text" id="checkout-coupon" placeholder="e.g. WELCOME50"></div>
      <div class="form-group"><label>Payment Method</label>
        <select id="checkout-payment"><option value="COD">Cash on Delivery</option><option value="ONLINE_MOCK">Mock Online Payment</option><option value="WALLET">Wallet</option></select>
      </div>
      <div class="form-group"><label>Special Instructions</label><textarea id="checkout-instructions"></textarea></div>
      <button class="btn btn-primary btn-block" onclick="confirmOrder()">Confirm Order</button>`;
    openModal("checkout-modal");
  } catch (err) { toast(err.message, "error"); }
}

async function confirmOrder() {
  try {
    const budget = await apiRequest("/budget");
    if (budget.spent_today >= budget.daily_budget * 0.75) {
      toast(`Heads up: you're about to use over 75% of today's ₹${budget.daily_budget} budget.`, "warning");
    }
    const order = await apiRequest("/orders", {
      method: "POST",
      body: {
        address: document.getElementById("checkout-address").value,
        coupon_code: document.getElementById("checkout-coupon").value || undefined,
        payment_method: document.getElementById("checkout-payment").value,
        special_instructions: document.getElementById("checkout-instructions").value,
      },
    });
    closeModal("checkout-modal");
    toast(`Order Confirmed! 🎉 ${order.order_id}`, "success");
    switchTab("orders");
    refreshBadges();
  } catch (err) { toast(err.message, "error"); }
}

/* ---- ORDERS ------------------------------------------------------------------- */
async function loadOrders() {
  try {
    const orders = await apiRequest("/orders");
    const list = document.getElementById("orders-list");
    list.innerHTML = orders.length ? orders.map(orderRowHtml).join("") : `<div class="empty-state"><i>📦</i>No orders yet.</div>`;
  } catch (err) { toast(err.message, "error"); }
}

function orderRowHtml(o) {
  const canCancel = !["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(o.status);
  const canReview = o.status === "DELIVERED";
  return `<div class="card" style="padding:16px;margin-bottom:12px;">
    <div class="card-row"><strong>${o.order_id}</strong><span class="tag">${o.status}</span></div>
    <div class="muted" style="font-size:13px;margin-bottom:8px;">${o.items.map(i => `${i.quantity}x ${escapeHtml(i.food_name)}`).join(", ")}</div>
    <div class="card-row"><span>${timeAgo(o.created_at)}</span><strong>${currency(o.total)}</strong></div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('track-order-id').value='${o.order_id}';switchTab('track');trackOrder();">Track</button>
      ${canCancel ? `<button class="btn btn-danger btn-sm" onclick="cancelOrder('${o.order_id}')">Cancel</button>` : ""}
      ${canReview ? `<button class="btn btn-primary btn-sm" onclick="openReview('${o.order_id}')">Review</button>` : ""}
      <button class="btn btn-ghost btn-sm" onclick="reorder('${JSON.stringify(o.items).replace(/'/g, "&apos;")}')">Reorder</button>
    </div>
  </div>`;
}

async function cancelOrder(id) {
  confirmAction("Cancel this order?", async () => {
    try { await apiRequest(`/orders/${id}/cancel`, { method: "PUT" }); toast("Order cancelled.", "success"); loadOrders(); }
    catch (err) { toast(err.message, "error"); }
  });
}

async function reorder(itemsJson) {
  try {
    const items = JSON.parse(itemsJson.replace(/&apos;/g, "'"));
    for (const i of items) { await apiRequest("/cart", { method: "POST", body: { food_id: i.food_id, quantity: i.quantity } }); }
    toast("Items added to cart from your previous order.", "success");
    switchTab("cart"); refreshBadges();
  } catch { toast("Some items may no longer be available.", "warning"); }
}

function openReview(orderId) {
  document.getElementById("review-body").innerHTML = `
    <input type="hidden" id="review-order-id" value="${orderId}">
    ${["Food", "Restaurant", "Delivery"].map(kind => `
      <div class="form-group"><label>${kind} Rating</label>
        <select id="review-${kind.toLowerCase()}">${[5,4,3,2,1].map(n => `<option value="${n}">${"⭐".repeat(n)}</option>`).join("")}</select>
      </div>`).join("")}
    <div class="form-group"><label>Write a review</label><textarea id="review-text"></textarea></div>
    <button class="btn btn-primary btn-block" onclick="submitReview()">Submit Review</button>`;
  openModal("review-modal");
}

async function submitReview() {
  const orderId = document.getElementById("review-order-id").value;
  try {
    await apiRequest(`/orders/${orderId}/review`, {
      method: "POST",
      body: {
        food_rating: Number(document.getElementById("review-food").value),
        restaurant_rating: Number(document.getElementById("review-restaurant").value),
        delivery_rating: Number(document.getElementById("review-delivery").value),
        text: document.getElementById("review-text").value,
      },
    });
    closeModal("review-modal");
    toast("Review submitted — +5 reward points!", "success");
  } catch (err) { toast(err.message, "error"); }
}

/* ---- TRACK ORDER ---------------------------------------------------------------- */
async function trackOrder() {
  const id = document.getElementById("track-order-id").value.trim();
  if (!id) return;
  try {
    const data = await apiRequest(`/orders/${id}/tracking`);
    const steps = ["PLACED", "CONFIRMED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"];
    const currentIndex = steps.indexOf(data.status);
    document.getElementById("track-result").innerHTML = `
      <ul class="timeline">
        ${steps.map((s, i) => `<li class="${i <= currentIndex ? "done" : ""}"><strong>${s.replace(/_/g, " ")}</strong>${data.timeline[s] ? `<div class="muted" style="font-size:12px;">${timeAgo(data.timeline[s])}</div>` : ""}</li>`).join("")}
      </ul>
      ${data.delivery_partner ? `
        <div class="stat-card" style="max-width:340px;">
          <strong>${escapeHtml(data.delivery_partner.name)}</strong> · ⭐ ${data.delivery_partner.rating}
          <div class="muted">${escapeHtml(data.delivery_partner.vehicle_type)}</div>
          ${data.current_location ? `<div class="muted">📍 Live location available</div>` : `<div class="muted">Location shown only during active delivery</div>`}
        </div>` : ""}`;
  } catch (err) { toast(err.message, "error"); }
}

/* ---- FAVORITES ------------------------------------------------------------------- */
async function loadFavorites() {
  try {
    const { foods, restaurants } = await apiRequest("/favorites");
    document.getElementById("fav-foods").innerHTML = foods.length ? foods.map(dashFoodCard).join("") : `<div class="empty-state"><i>♡</i>No favorite food yet.</div>`;
    document.getElementById("fav-restaurants").innerHTML = restaurants.length ? restaurants.map(r => `<div class="card"><div class="card-body"><strong>${escapeHtml(r.name)}</strong><div class="muted">${escapeHtml(r.cuisine)}</div></div></div>`).join("") : `<div class="empty-state">No favorite restaurants yet.</div>`;
  } catch (err) { toast(err.message, "error"); }
}

/* ---- PREFERENCES ----------------------------------------------------------------- */
async function loadPreferences() {
  const p = Session.profile.preferences || {};
  document.getElementById("pref-food-type").value = p.food_type || "Vegetarian";
  document.getElementById("pref-spice").value = p.spice_level || "Medium";
  document.getElementById("pref-nutrition").value = p.nutrition_goal || "";
  document.getElementById("pref-daily-budget").value = p.daily_budget || 400;
  document.getElementById("pref-monthly-budget").value = p.monthly_budget || 8000;
}

async function savePreferences() {
  const prefs = {
    ...Session.profile.preferences,
    food_type: document.getElementById("pref-food-type").value,
    spice_level: document.getElementById("pref-spice").value,
    nutrition_goal: document.getElementById("pref-nutrition").value,
    daily_budget: Number(document.getElementById("pref-daily-budget").value),
    monthly_budget: Number(document.getElementById("pref-monthly-budget").value),
  };
  try {
    const updated = await apiRequest("/users/preferences", { method: "PUT", body: prefs });
    localStorage.setItem("ff_profile", JSON.stringify(updated));
    toast("Preferences saved.", "success");
  } catch (err) { toast(err.message, "error"); }
}

/* ---- ADDRESSES --------------------------------------------------------------------- */
async function loadAddresses() {
  try {
    const list = await apiRequest("/users/addresses");
    document.getElementById("address-list").innerHTML = list.length ? list.map(a => `
      <div class="card" style="padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
        <div><strong>${escapeHtml(a.label)}</strong><div class="muted">${escapeHtml(a.text)}</div></div>
        <button class="btn btn-ghost btn-sm" onclick="deleteAddress('${a.address_id}')">Delete</button>
      </div>`).join("") : `<div class="empty-state"><i>📍</i>No addresses saved yet.</div>`;
  } catch (err) { toast(err.message, "error"); }
}

async function addAddress() {
  try {
    await apiRequest("/users/addresses", { method: "POST", body: { label: document.getElementById("new-addr-label").value || "Home", text: document.getElementById("new-addr-text").value } });
    closeModal("address-modal"); toast("Address added.", "success"); loadAddresses();
  } catch (err) { toast(err.message, "error"); }
}
async function deleteAddress(id) {
  confirmAction("Delete this address?", async () => {
    try { await apiRequest(`/users/addresses/${id}`, { method: "DELETE" }); loadAddresses(); }
    catch (err) { toast(err.message, "error"); }
  });
}

/* ---- REWARDS ------------------------------------------------------------------------- */
async function loadRewards() {
  try {
    const { points, transactions } = await apiRequest("/rewards");
    document.getElementById("rewards-points").textContent = points;
    document.getElementById("rewards-history").innerHTML = transactions.length ? `<table><tr><th>Reason</th><th>Points</th><th>Date</th></tr>${transactions.map(t => `<tr><td>${escapeHtml(t.reason)}</td><td>${t.points > 0 ? "+" : ""}${t.points}</td><td>${timeAgo(t.created_at)}</td></tr>`).join("")}</table>` : `<div class="empty-state">No reward activity yet.</div>`;
  } catch (err) { toast(err.message, "error"); }
}
async function redeemPoints() {
  const points = Number(document.getElementById("redeem-points").value);
  if (!points) return;
  try { const res = await apiRequest("/rewards/redeem", { method: "POST", body: { points } }); toast(res.message, "success"); loadRewards(); }
  catch (err) { toast(err.message, "error"); }
}

/* ---- BUDGET -------------------------------------------------------------------------- */
async function loadBudget() {
  try {
    const b = await apiRequest("/budget");
    document.getElementById("budget-text").textContent = `${currency(b.spent_today)} / ${currency(b.daily_budget)}`;
    document.getElementById("budget-fill").style.width = `${Math.min(100, (b.spent_today / b.daily_budget) * 100)}%`;
  } catch (err) { toast(err.message, "error"); }
}

/* ---- NUTRITION ------------------------------------------------------------------------- */
async function loadNutrition() {
  try {
    const n = await apiRequest("/nutrition/today");
    document.getElementById("nut-calories").textContent = `${n.calories} kcal`;
    document.getElementById("nut-protein").textContent = `${n.protein} g`;
  } catch (err) { toast(err.message, "error"); }
}

/* ---- GROUP ORDER ------------------------------------------------------------------------- */
async function createGroup() {
  try {
    const g = await apiRequest("/groups", { method: "POST", body: { restaurant_id: document.getElementById("group-restaurant-id").value, name: Session.profile.name } });
    document.getElementById("group-result").innerHTML = `<div class="stat-card">Group created! Share this code: <strong style="font-size:20px;">${g.code}</strong></div>`;
    toast("Group order created — +10 reward points!", "success");
  } catch (err) { toast(err.message, "error"); }
}
async function joinGroup() {
  try {
    const g = await apiRequest("/groups/join", { method: "POST", body: { code: document.getElementById("group-join-code").value, name: Session.profile.name } });
    document.getElementById("group-result").innerHTML = `<div class="stat-card">Joined group <strong>${g.code}</strong> with ${g.members.length} member(s): ${g.members.map(m => escapeHtml(m.name)).join(", ")}</div>`;
    toast("Joined group order.", "success");
  } catch (err) { toast(err.message, "error"); }
}

/* ---- ACTIVITY --------------------------------------------------------------------------- */
async function loadActivity() {
  try {
    const activity = await apiRequest("/activity");
    document.getElementById("activity-timeline").innerHTML = activity.length ? activity.map(a => `<li class="done"><strong>${a.activity_type.replace(/_/g, " ")}</strong><div class="muted" style="font-size:12px;">${timeAgo(a.created_at)}</div></li>`).join("") : `<div class="empty-state">No activity recorded yet.</div>`;
  } catch (err) { toast(err.message, "error"); }
}

/* ---- NOTIFICATIONS ------------------------------------------------------------------------ */
async function loadNotifications() {
  try {
    const list = await apiRequest("/notifications");
    document.getElementById("notifications-list").innerHTML = list.length ? list.map(n => `
      <div class="card" style="padding:14px;margin-bottom:8px;opacity:${n.read ? 0.6 : 1};cursor:pointer;" onclick="markRead('${n.notification_id}')">
        <strong>${escapeHtml(n.title)}</strong><div class="muted">${escapeHtml(n.message)}</div>
        <div class="muted" style="font-size:11px;">${timeAgo(n.created_at)}</div>
      </div>`).join("") : `<div class="empty-state"><i>🔔</i>No notifications.</div>`;
    refreshBadges();
  } catch (err) { toast(err.message, "error"); }
}
async function markRead(id) {
  try { await apiRequest(`/notifications/${id}/read`, { method: "PUT" }); loadNotifications(); } catch { /* ignore */ }
}

/* ---- PROFILE ------------------------------------------------------------------------------ */
async function loadProfile() {
  const p = await apiRequest("/users/profile");
  document.getElementById("profile-name").value = p.name;
  document.getElementById("profile-phone").value = p.phone;
  document.getElementById("profile-email").value = p.email;
}
async function saveProfile() {
  try {
    const updated = await apiRequest("/users/profile", { method: "PUT", body: { name: document.getElementById("profile-name").value, phone: document.getElementById("profile-phone").value } });
    localStorage.setItem("ff_profile", JSON.stringify(updated));
    toast("Profile updated.", "success");
  } catch (err) { toast(err.message, "error"); }
}
