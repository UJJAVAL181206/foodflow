/* =========================================================================
   FoodFlow - index.html logic
   Browsing restaurants/food, search, filters, auth modals (login/register
   for both customer and delivery partner), food details + add-to-cart.
   ========================================================================= */

let activeFoodFilters = {};
let registerRole = "customer";
let loginRole = "customer";
let regStepIndex = 0;
let regData = { favorite_cuisines: [], food_goals: [] };

document.addEventListener("DOMContentLoaded", () => {
  refreshNavForSession();
  loadFoods();
  loadRestaurants();
  loadFoodRescue();
  wireFilterChips();
  buildRegisterSteps();
  if (Session.isLoggedIn() && Session.role === "customer") loadRecommendations();
});

/* ---- Section visibility (simple single-page sections) --------------------- */
function showSection(name) {
  document.getElementById("search-results-section").style.display = "none";
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
  const map = { home: null, restaurants: "restaurants-section", foods: "foods-section", rescue: "rescue-section" };
  if (map[name]) document.getElementById(map[name]).scrollIntoView({ behavior: "smooth" });
}

function requireLogin(nextPage) {
  if (Session.isLoggedIn()) { window.location.href = nextPage; }
  else { toast("Please log in to continue.", "warning"); openModal("login-modal"); }
}

/* ---- Nav state -------------------------------------------------------------- */
async function refreshNavForSession() {
  const guest = document.getElementById("guest-actions");
  const user = document.getElementById("user-actions");
  if (Session.isLoggedIn() && Session.role === "customer") {
    guest.style.display = "none";
    user.style.display = "flex";
    try {
      const notifs = await apiRequest("/notifications");
      const unread = notifs.filter(n => !n.read).length;
      const badge = document.getElementById("notif-badge");
      if (unread > 0) { badge.style.display = "flex"; badge.textContent = unread; }
      const cartItems = await apiRequest("/cart");
      const cbadge = document.getElementById("cart-badge");
      if (cartItems.length > 0) { cbadge.style.display = "flex"; cbadge.textContent = cartItems.length; }
    } catch { /* not fatal on homepage */ }
  } else {
    guest.style.display = "block";
    user.style.display = "none";
  }
}

/* ---- Global search ---------------------------------------------------------- */
let searchTimer = null;
function handleGlobalSearch(query) {
  clearTimeout(searchTimer);
  if (!query || query.trim().length < 2) {
    document.getElementById("search-results-section").style.display = "none";
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const results = await apiRequest(`/search?q=${encodeURIComponent(query)}`, { auth: false });
      renderSearchResults(results);
    } catch (err) { toast(err.message, "error"); }
  }, 350);
}

function renderSearchResults(results) {
  const section = document.getElementById("search-results-section");
  const grid = document.getElementById("search-results");
  const combined = [...results.restaurants.map(r => ({ ...r, __type: "restaurant" })), ...results.foods.map(f => ({ ...f, __type: "food" }))];
  if (combined.length === 0) {
    grid.innerHTML = `<div class="empty-state"><i>🔍</i>No results found. Try a different search.</div>`;
  } else {
    grid.innerHTML = combined.map(item => item.__type === "food" ? foodCardHtml(item) : restaurantCardHtml(item)).join("");
  }
  section.style.display = "block";
  section.scrollIntoView({ behavior: "smooth" });
}

/* ---- Food browsing & filters --------------------------------------------------- */
function wireFilterChips() {
  document.querySelectorAll("#food-filters .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const filter = chip.dataset.filter;
      const value = chip.dataset.value;
      document.querySelectorAll(`#food-filters .chip[data-filter="${filter}"]`).forEach(c => c.classList.remove("active"));
      if (filter === "food_type" && value === "") {
        activeFoodFilters = {};
        document.querySelectorAll("#food-filters .chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
      } else {
        chip.classList.toggle("active");
        if (chip.classList.contains("active")) activeFoodFilters[filter] = value;
        else delete activeFoodFilters[filter];
      }
      loadFoods();
    });
  });
}

async function loadFoods() {
  const grid = document.getElementById("food-grid");
  grid.innerHTML = skeletonCards(4);
  try {
    const params = new URLSearchParams(activeFoodFilters).toString();
    const foods = await apiRequest(`/foods${params ? "?" + params : ""}`, { auth: false });
    grid.innerHTML = foods.length ? foods.map(foodCardHtml).join("") : `<div class="empty-state"><i>🍽️</i>No food matches these filters.</div>`;
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><i>⚠️</i>${escapeHtml(err.message)}</div>`;
  }
}

async function loadRestaurants() {
  const grid = document.getElementById("restaurant-grid");
  grid.innerHTML = skeletonCards(4);
  try {
    const restaurants = await apiRequest("/restaurants", { auth: false });
    grid.innerHTML = restaurants.map(restaurantCardHtml).join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><i>⚠️</i>${escapeHtml(err.message)}</div>`;
  }
}

async function loadFoodRescue() {
  const grid = document.getElementById("rescue-grid");
  grid.innerHTML = skeletonCards(3);
  try {
    const items = await apiRequest("/food-rescue", { auth: false });
    grid.innerHTML = items.length ? items.map(rescueCardHtml).join("") : `<div class="empty-state"><i>🍱</i>No Food Rescue items nearby right now.</div>`;
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><i>⚠️</i>${escapeHtml(err.message)}</div>`;
  }
}

async function loadRecommendations() {
  try {
    const recs = await apiRequest("/recommendations");
    const profile = Session.profile;
    document.getElementById("greeting").textContent = `Recommended for you, ${profile?.name?.split(" ")[0] || ""} 👋`;
    document.getElementById("recommended-cards").innerHTML = recs.map(foodCardHtml).join("");
    document.getElementById("recommended-section").style.display = "block";
  } catch { /* silent - not critical */ }
}

/* ---- Card templates ----------------------------------------------------------- */
function skeletonCards(n) {
  return Array.from({ length: n }).map(() => `
    <div class="card"><div class="card-img-wrap skeleton" style="height:150px;"></div>
    <div class="card-body"><div class="skeleton" style="height:14px;width:70%;margin-bottom:8px;"></div>
    <div class="skeleton" style="height:12px;width:50%;"></div></div></div>`).join("");
}

function foodCardHtml(f) {
  const vegTag = f.food_type === "Vegetarian" || f.food_type === "Vegan" ? "tag tag-veg" : "tag";
  return `
  <div class="card">
    <div class="card-img-wrap" onclick="openFoodDetails('${f.food_id}')" style="cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:48px;">🍽️</div>
    <div class="card-body">
      <div class="card-row"><span class="rating-pill">⭐ ${f.rating || 4.5}</span><span class="${vegTag}">${escapeHtml(f.food_type || "")}</span></div>
      <div class="card-title" onclick="openFoodDetails('${f.food_id}')" style="cursor:pointer;">${escapeHtml(f.name)}</div>
      <div class="card-sub">${escapeHtml(f.cuisine || "")} · ${f.delivery_time || 25} min · ${f.calories || 0} kcal · ${f.protein || 0}g protein</div>
      <div class="card-row"><strong>${currency(f.price)}</strong>
        <div class="card-actions">
          <button class="fav-btn" onclick="toggleFavorite(event,'${f.food_id}',null,this)">♡</button>
        </div>
      </div>
      <button class="btn btn-primary btn-block btn-sm" onclick="quickAddToCart('${f.food_id}')">Add to Cart</button>
    </div>
  </div>`;
}

function restaurantCardHtml(r) {
  return `
  <div class="card">
    <div class="card-img-wrap" style="display:flex;align-items:center;justify-content:center;font-size:48px;">🏬</div>
    <div class="card-body">
      <div class="card-row"><span class="rating-pill">⭐ ${r.rating || 4.5}</span><span class="tag">Trust ${r.trust_score ?? 80}/100</span></div>
      <div class="card-title">${escapeHtml(r.name)}</div>
      <div class="card-sub">${escapeHtml(r.cuisine || "")} · ${r.delivery_time || 30} min · ${escapeHtml(r.price_range || "₹₹")}</div>
      <button class="btn btn-outline btn-block btn-sm" onclick="viewRestaurantMenu('${r.restaurant_id}')">View Menu</button>
    </div>
  </div>`;
}

function rescueCardHtml(item) {
  return `
  <div class="card">
    <div class="card-img-wrap" style="display:flex;align-items:center;justify-content:center;font-size:48px;">🍱</div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(item.food_name)}</div>
      <div class="card-sub">Save Food + Save Money · ${item.portions_left} portions left</div>
      <div class="card-row"><span class="muted" style="text-decoration:line-through;">${currency(item.normal_price)}</span>
        <strong style="color:var(--secondary);">${currency(item.rescue_price)}</strong></div>
      <button class="btn btn-primary btn-block btn-sm" onclick="orderRescue('${item.rescue_id}')">Rescue This Meal</button>
    </div>
  </div>`;
}

async function viewRestaurantMenu(id) {
  try {
    const data = await apiRequest(`/restaurants/${id}`, { auth: false });
    document.getElementById("food-grid").innerHTML = data.menu.map(foodCardHtml).join("");
    document.getElementById("foods-section").scrollIntoView({ behavior: "smooth" });
    toast(`Showing ${data.restaurant.name}'s menu`, "info");
  } catch (err) { toast(err.message, "error"); }
}

/* ---- Food details modal ------------------------------------------------------- */
async function openFoodDetails(foodId) {
  try {
    const { food, reviews } = await apiRequest(`/foods/${foodId}`, { auth: false });
    document.getElementById("food-modal-body").innerHTML = `
      <div style="font-size:60px;text-align:center;">🍽️</div>
      <h2>${escapeHtml(food.name)}</h2>
      <p class="muted">${escapeHtml(food.description || "")}</p>
      <div class="card-row"><span class="rating-pill">⭐ ${food.rating}</span><strong>${currency(food.price)}</strong></div>
      <div class="filters-bar">
        <span class="chip active">${food.calories} kcal</span>
        <span class="chip active">${food.protein}g protein</span>
        <span class="chip active">${escapeHtml(food.food_type)}</span>
        <span class="chip active">${food.delivery_time} min</span>
      </div>
      <button class="btn btn-primary btn-block" onclick="quickAddToCart('${food.food_id}');closeModal('food-modal')">Add to Cart</button>
      <h3 style="margin-top:20px;">Reviews</h3>
      ${reviews.length ? reviews.map(r => `
        <div style="border-bottom:1px solid var(--border);padding:10px 0;">
          <strong>⭐ ${r.food_rating}</strong> <span class="muted" style="font-size:12px;">${timeAgo(r.created_at)}</span>
          <p style="margin:4px 0 0;font-size:14px;">${escapeHtml(r.text || "")}</p>
        </div>`).join("") : `<p class="muted">No reviews yet.</p>`}
    `;
    openModal("food-modal");
  } catch (err) { toast(err.message, "error"); }
}

async function quickAddToCart(foodId) {
  if (!Session.isLoggedIn() || Session.role !== "customer") { toast("Please log in as a customer to order.", "warning"); openModal("login-modal"); return; }
  try {
    await apiRequest("/cart", { method: "POST", body: { food_id: foodId, quantity: 1 } });
    toast("Added to cart", "success");
    refreshNavForSession();
  } catch (err) { toast(err.message, "error"); }
}

async function toggleFavorite(event, foodId, restaurantId, btn) {
  event.stopPropagation();
  if (!Session.isLoggedIn()) { toast("Please log in to save favorites.", "warning"); openModal("login-modal"); return; }
  try {
    const res = await apiRequest("/favorites", { method: "POST", body: { food_id: foodId, restaurant_id: restaurantId } });
    btn.classList.toggle("active", res.favorited);
    btn.textContent = res.favorited ? "♥" : "♡";
  } catch (err) { toast(err.message, "error"); }
}

async function orderRescue(rescueId) {
  if (!Session.isLoggedIn() || Session.role !== "customer") { toast("Please log in as a customer.", "warning"); openModal("login-modal"); return; }
  confirmAction("Rescue this meal and place an order now?", async () => {
    try {
      const addr = Session.profile?.defaultAddress || "Default address";
      await apiRequest(`/food-rescue/${rescueId}/order`, { method: "POST", body: { address: addr } });
      toast("Food Rescue order placed! +15 reward points 🎉", "success");
      loadFoodRescue();
    } catch (err) { toast(err.message, "error"); }
  });
}

/* ---- Login -------------------------------------------------------------------- */
function setLoginRole(role) {
  loginRole = role;
  document.getElementById("login-as-customer").classList.toggle("active", role === "customer");
  document.getElementById("login-as-delivery").classList.toggle("active", role === "delivery");
}

async function handleLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById("login-identifier").value;
  const password = document.getElementById("login-password").value;
  const endpoint = loginRole === "delivery" ? "/delivery/login" : "/auth/login";
  try {
    const data = await apiRequest(endpoint, { method: "POST", auth: false, body: { identifier, password } });
    const profile = loginRole === "delivery" ? data.partner : data.user;
    Session.save(data.token, loginRole, profile);
    toast(`Welcome back, ${profile.name.split(" ")[0]}!`, "success");
    closeModal("login-modal");
    window.location.href = loginRole === "delivery" ? "delivery.html" : "dashboard.html";
  } catch (err) { toast(err.message, "error"); }
}

/* ---- Register (multi-step) ------------------------------------------------------ */
function setRegisterRole(role) {
  registerRole = role;
  regStepIndex = 0;
  document.getElementById("reg-as-customer").classList.toggle("active", role === "customer");
  document.getElementById("reg-as-delivery").classList.toggle("active", role === "delivery");
  buildRegisterSteps();
}

const customerSteps = [
  { title: "Basic details", fields: ["name", "email", "phone", "password", "confirm_password"] },
  { title: "Date of birth", fields: ["dob"] },
  { title: "Food preference", fields: ["food_type"] },
  { title: "Favorite cuisines", fields: ["favorite_cuisines"] },
  { title: "Food goals", fields: ["food_goals"] },
  { title: "Spice preference", fields: ["spice_level"] },
  { title: "Daily budget", fields: ["daily_budget"] },
  { title: "Address", fields: ["address"] },
];
const deliverySteps = [
  { title: "Basic details", fields: ["name", "email", "phone", "password"] },
  { title: "Vehicle information", fields: ["vehicle_type", "vehicle_number"] },
  { title: "Identity verification", fields: ["id_verification"] },
];

function currentSteps() { return registerRole === "delivery" ? deliverySteps : customerSteps; }

function buildRegisterSteps() {
  regStepIndex = 0;
  renderRegStep();
}

function renderRegStep() {
  const steps = currentSteps();
  const step = steps[regStepIndex];
  const dots = document.getElementById("reg-dots");
  dots.innerHTML = steps.map((_, i) => `<span class="${i === regStepIndex ? "active" : ""}"></span>`).join("");

  const fieldHtml = (field) => {
    switch (field) {
      case "name": return `<div class="form-group"><label>Full Name</label><input type="text" data-field="name" required></div>`;
      case "email": return `<div class="form-group"><label>Email</label><input type="email" data-field="email" required></div>`;
      case "phone": return `<div class="form-group"><label>Phone</label><input type="tel" data-field="phone" required></div>`;
      case "password": return `<div class="form-group"><label>Password</label><input type="password" data-field="password" required></div>`;
      case "confirm_password": return `<div class="form-group"><label>Confirm Password</label><input type="password" data-field="confirm_password" required></div>`;
      case "dob": return `<div class="form-group"><label>Date of Birth</label><input type="date" data-field="dob"></div>`;
      case "food_type": return `<div class="pref-grid">${["Vegetarian", "Non-Vegetarian", "Vegan", "No preference"].map(v => `<span class="pref-chip" data-field="food_type" data-value="${v}" onclick="selectSingle(this)">${v}</span>`).join("")}</div>`;
      case "favorite_cuisines": return `<div class="pref-grid">${["Indian", "Chinese", "Italian", "Mexican", "Fast Food", "South Indian", "North Indian"].map(v => `<span class="pref-chip" data-field="favorite_cuisines" data-value="${v}" onclick="selectMulti(this)">${v}</span>`).join("")}</div>`;
      case "food_goals": return `<div class="pref-grid">${["Healthy eating", "High protein", "Weight management", "Budget friendly", "Fast delivery", "Taste focused"].map(v => `<span class="pref-chip" data-field="food_goals" data-value="${v}" onclick="selectMulti(this)">${v}</span>`).join("")}</div>`;
      case "spice_level": return `<div class="pref-grid">${["Low", "Medium", "High"].map(v => `<span class="pref-chip" data-field="spice_level" data-value="${v}" onclick="selectSingle(this)">${v}</span>`).join("")}</div>`;
      case "daily_budget": return `<div class="form-group"><label>Daily food budget (₹)</label><input type="number" data-field="daily_budget" value="400"></div>`;
      case "address": return `<div class="form-group"><label>Address</label><textarea data-field="address" placeholder="House no, street, city"></textarea></div>`;
      case "vehicle_type": return `<div class="pref-grid">${["Bike", "Scooter", "Bicycle", "Car"].map(v => `<span class="pref-chip" data-field="vehicle_type" data-value="${v}" onclick="selectSingle(this)">${v}</span>`).join("")}</div>`;
      case "vehicle_number": return `<div class="form-group"><label>Vehicle Number</label><input type="text" data-field="vehicle_number"></div>`;
      case "id_verification": return `<div class="form-group"><label>ID Verification Note</label><input type="text" data-field="id_verification" placeholder="e.g. Aadhaar / License number"></div>`;
      default: return "";
    }
  };

  document.getElementById("reg-steps").innerHTML = `<h4>${step.title}</h4>` + step.fields.map(fieldHtml).join("");
  document.getElementById("reg-back").style.display = regStepIndex > 0 ? "inline-flex" : "none";
  const isLast = regStepIndex === steps.length - 1;
  document.getElementById("reg-next").style.display = isLast ? "none" : "block";
  document.getElementById("reg-submit").style.display = isLast ? "block" : "none";
}

function selectSingle(el) {
  const field = el.dataset.field;
  document.querySelectorAll(`.pref-chip[data-field="${field}"]`).forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
  regData[field] = el.dataset.value;
}
function selectMulti(el) {
  const field = el.dataset.field;
  el.classList.toggle("selected");
  if (!regData[field]) regData[field] = [];
  if (el.classList.contains("selected")) regData[field].push(el.dataset.value);
  else regData[field] = regData[field].filter(v => v !== el.dataset.value);
}

function collectStepInputs() {
  document.querySelectorAll("#reg-steps input[data-field], #reg-steps textarea[data-field]").forEach(input => {
    regData[input.dataset.field] = input.value;
  });
}

function regStep(direction) {
  collectStepInputs();
  const steps = currentSteps();
  if (direction === 1 && regStepIndex === 0) {
    if (registerRole === "customer" && regData.password !== regData.confirm_password) {
      toast("Passwords do not match.", "error"); return;
    }
  }
  regStepIndex = Math.min(steps.length - 1, Math.max(0, regStepIndex + direction));
  renderRegStep();
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  collectStepInputs();
  try {
    if (registerRole === "delivery") {
      const data = await apiRequest("/delivery/register", { method: "POST", auth: false, body: regData });
      Session.save(data.token, "delivery", data.partner);
      toast("Delivery partner account created!", "success");
      window.location.href = "delivery.html";
    } else {
      const data = await apiRequest("/auth/register", { method: "POST", auth: false, body: regData });
      Session.save(data.token, "customer", data.user);
      toast("Welcome to FoodFlow! 🎉", "success");
      window.location.href = "dashboard.html";
    }
  } catch (err) { toast(err.message, "error"); }
}
