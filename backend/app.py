"""
FoodFlow - Main Flask Application
Every REST API endpoint lives here (kept as one file on purpose: this is the
"minimum files" build of FoodFlow). Endpoints are grouped by section with
comment headers that mirror the FoodFlow spec sections.

Run with:  python app.py   (see README.md for full setup)
"""
from datetime import datetime, date, timedelta

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, get_jwt, get_jwt_identity,
    jwt_required, verify_jwt_in_request,
)

from config import Config
from database import (
    create_indexes, users, delivery_partners, admins, restaurants, foods,
    orders, reviews, cart, favorites, addresses, notifications,
    user_activity, delivery_activity, delivery_locations, coupons,
    reward_transactions, wallet_transactions, food_rescue, groups,
)
from helpers import (
    new_id, now, hash_password, verify_password, role_required,
    log_user_activity, log_delivery_activity, push_notification, add_points,
    calculate_trust_score, get_recommendations, budget_used_today,
)

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = Config.JWT_SECRET_KEY
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = Config.JWT_ACCESS_TOKEN_EXPIRES
CORS(app)
jwt = JWTManager(app)

with app.app_context():
    create_indexes()


def serialize(doc):
    """Strip Mongo's internal _id before returning JSON to the client."""
    if not doc:
        return doc
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


def serialize_many(docs):
    return [serialize(d) for d in docs]


def current_identity():
    """Returns (id, role) of the authenticated caller. Never trust client-sent ids."""
    verify_jwt_in_request()
    return get_jwt_identity(), get_jwt().get("role")


# =========================================================================
# 1. AUTH  (customers, delivery partners, admin)
# =========================================================================
@app.post("/api/auth/register")
def register_customer():
    data = request.get_json(force=True)
    required = ["name", "email", "phone", "password"]
    if not all(data.get(f) for f in required):
        return jsonify({"error": "Name, email, phone and password are required."}), 400
    if users.find_one({"email": data["email"]}):
        return jsonify({"error": "An account with this email already exists."}), 409

    user_id = new_id("U")
    doc = {
        "user_id": user_id,
        "name": data["name"],
        "email": data["email"],
        "phone": data["phone"],
        "password_hash": hash_password(data["password"]),
        "dob": data.get("dob"),
        "profile_image": data.get("profile_image", ""),
        "preferences": {
            "food_type": data.get("food_type", "No preference"),
            "favorite_cuisines": data.get("favorite_cuisines", []),
            "food_goals": data.get("food_goals", []),
            "spice_level": data.get("spice_level", "Medium"),
            "daily_budget": data.get("daily_budget", 400),
            "monthly_budget": data.get("monthly_budget", 8000),
            "allergies": data.get("allergies", []),
            "nutrition_goal": data.get("nutrition_goal", ""),
        },
        "reward_points": 0,
        "wallet_balance": 0,
        "blocked": False,
        "created_at": now(),
    }
    users.insert_one(doc)

    if data.get("address"):
        addresses.insert_one({
            "address_id": new_id("A"),
            "user_id": user_id,
            "label": "Home",
            "text": data["address"],
            "is_default": True,
        })

    log_user_activity(user_id, "REGISTER")
    push_notification(user_id, "Welcome to FoodFlow! 🎉", "Your profile is ready. Explore food picked for you.")
    token = create_access_token(identity=user_id, additional_claims={"role": "customer"})
    return jsonify({"token": token, "user": serialize(doc)}), 201


@app.post("/api/auth/login")
def login_customer():
    data = request.get_json(force=True)
    user = users.find_one({"$or": [{"email": data.get("identifier")}, {"phone": data.get("identifier")}]})
    if not user or not verify_password(data.get("password", ""), user["password_hash"]):
        return jsonify({"error": "Invalid email/phone or password."}), 401
    if user.get("blocked"):
        return jsonify({"error": "This account has been blocked. Contact support."}), 403

    log_user_activity(user["user_id"], "LOGIN")
    token = create_access_token(identity=user["user_id"], additional_claims={"role": "customer"})
    return jsonify({"token": token, "user": serialize(user)})


@app.post("/api/auth/logout")
@jwt_required()
def logout_customer():
    user_id, role = current_identity()
    if role == "customer":
        log_user_activity(user_id, "LOGOUT")
    return jsonify({"message": "Logged out."})


@app.post("/api/delivery/register")
def register_delivery_partner():
    data = request.get_json(force=True)
    required = ["name", "email", "phone", "password", "vehicle_type"]
    if not all(data.get(f) for f in required):
        return jsonify({"error": "Name, email, phone, password and vehicle type are required."}), 400
    if delivery_partners.find_one({"email": data["email"]}):
        return jsonify({"error": "An account with this email already exists."}), 409

    dp_id = new_id("D")
    doc = {
        "delivery_partner_id": dp_id,
        "name": data["name"],
        "email": data["email"],
        "phone": data["phone"],
        "password_hash": hash_password(data["password"]),
        "profile_image": data.get("profile_image", ""),
        "vehicle_type": data["vehicle_type"],
        "vehicle_number": data.get("vehicle_number", ""),
        "id_verification": data.get("id_verification", ""),
        "available": False,
        "rating": 5.0,
        "total_deliveries": 0,
        "earnings": 0,
        "blocked": False,
        "created_at": now(),
    }
    delivery_partners.insert_one(doc)
    log_delivery_activity(dp_id, "REGISTER")
    token = create_access_token(identity=dp_id, additional_claims={"role": "delivery"})
    return jsonify({"token": token, "partner": serialize(doc)}), 201


@app.post("/api/delivery/login")
def login_delivery_partner():
    data = request.get_json(force=True)
    dp = delivery_partners.find_one({"email": data.get("identifier")})
    if not dp or not verify_password(data.get("password", ""), dp["password_hash"]):
        return jsonify({"error": "Invalid email or password."}), 401
    if dp.get("blocked"):
        return jsonify({"error": "This account has been blocked. Contact support."}), 403

    log_delivery_activity(dp["delivery_partner_id"], "LOGIN")
    token = create_access_token(identity=dp["delivery_partner_id"], additional_claims={"role": "delivery"})
    return jsonify({"token": token, "partner": serialize(dp)})


@app.post("/api/admin/login")
def login_admin():
    data = request.get_json(force=True)
    admin = admins.find_one({"email": data.get("identifier")})
    if not admin or not verify_password(data.get("password", ""), admin["password_hash"]):
        return jsonify({"error": "Invalid admin credentials."}), 401
    token = create_access_token(identity=admin["admin_id"], additional_claims={"role": "admin"})
    return jsonify({"token": token, "admin": serialize(admin)})


# =========================================================================
# 2. USER PROFILE & PREFERENCES
# =========================================================================
@app.get("/api/users/profile")
@role_required("customer")
def get_profile():
    user_id, _ = current_identity()
    user = users.find_one({"user_id": user_id})
    return jsonify(serialize(user))


@app.put("/api/users/profile")
@role_required("customer")
def update_profile():
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    allowed = {"name", "phone", "profile_image"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if updates:
        users.update_one({"user_id": user_id}, {"$set": updates})
    log_user_activity(user_id, "PROFILE_UPDATED")
    return jsonify(serialize(users.find_one({"user_id": user_id})))


@app.put("/api/users/preferences")
@role_required("customer")
def update_preferences():
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    users.update_one({"user_id": user_id}, {"$set": {"preferences": data}})
    log_user_activity(user_id, "PREFERENCES_UPDATED")
    return jsonify(serialize(users.find_one({"user_id": user_id})))


@app.get("/api/users/addresses")
@role_required("customer")
def list_addresses():
    user_id, _ = current_identity()
    return jsonify(serialize_many(addresses.find({"user_id": user_id})))


@app.post("/api/users/addresses")
@role_required("customer")
def add_address():
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    doc = {
        "address_id": new_id("A"),
        "user_id": user_id,
        "label": data.get("label", "Home"),
        "text": data["text"],
        "is_default": data.get("is_default", False),
    }
    addresses.insert_one(doc)
    return jsonify(serialize(doc)), 201


@app.delete("/api/users/addresses/<address_id>")
@role_required("customer")
def delete_address(address_id):
    user_id, _ = current_identity()
    addresses.delete_one({"address_id": address_id, "user_id": user_id})
    return jsonify({"message": "Address removed."})


# =========================================================================
# 3. RESTAURANTS, FOODS, SEARCH, FILTERS
# =========================================================================
@app.get("/api/restaurants")
def list_restaurants():
    docs = list(restaurants.find({}))
    for r in docs:
        r["trust_score"] = calculate_trust_score(r["restaurant_id"])
    return jsonify(serialize_many(docs))


@app.get("/api/restaurants/<restaurant_id>")
def get_restaurant(restaurant_id):
    r = restaurants.find_one({"restaurant_id": restaurant_id})
    if not r:
        return jsonify({"error": "Restaurant not found."}), 404
    r["trust_score"] = calculate_trust_score(restaurant_id)
    menu = list(foods.find({"restaurant_id": restaurant_id}))
    return jsonify({"restaurant": serialize(r), "menu": serialize_many(menu)})


@app.get("/api/foods")
def list_foods():
    query = {}
    food_type = request.args.get("food_type")
    cuisine = request.args.get("cuisine")
    max_price = request.args.get("max_price")
    min_price = request.args.get("min_price")
    min_rating = request.args.get("min_rating")
    max_delivery_time = request.args.get("max_delivery_time")
    high_protein = request.args.get("high_protein")
    low_calorie = request.args.get("low_calorie")
    only_rescue = request.args.get("food_rescue")
    only_offers = request.args.get("offers")

    if food_type:
        query["food_type"] = food_type
    if cuisine:
        query["cuisine"] = cuisine
    if max_price or min_price:
        query["price"] = {}
        if min_price:
            query["price"]["$gte"] = float(min_price)
        if max_price:
            query["price"]["$lte"] = float(max_price)
    if min_rating:
        query["rating"] = {"$gte": float(min_rating)}
    if max_delivery_time:
        query["delivery_time"] = {"$lte": int(max_delivery_time)}
    if high_protein == "true":
        query["protein"] = {"$gte": 20}
    if low_calorie == "true":
        query["calories"] = {"$lte": 400}
    if only_rescue == "true":
        query["is_rescue_eligible"] = True
    if only_offers == "true":
        query["has_offer"] = True

    docs = list(foods.find(query).limit(100))
    return jsonify(serialize_many(docs))


@app.get("/api/foods/<food_id>")
def get_food(food_id):
    f = foods.find_one({"food_id": food_id})
    if not f:
        return jsonify({"error": "Food not found."}), 404
    food_reviews = list(reviews.find({"food_id": food_id}).sort("created_at", -1).limit(20))
    return jsonify({"food": serialize(f), "reviews": serialize_many(food_reviews)})


@app.get("/api/search")
def search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"foods": [], "restaurants": []})
    regex = {"$regex": q, "$options": "i"}
    matched_foods = list(foods.find({"$or": [{"name": regex}, {"cuisine": regex}, {"category": regex}]}).limit(30))
    matched_restaurants = list(restaurants.find({"$or": [{"name": regex}, {"cuisine": regex}]}).limit(15))
    return jsonify({"foods": serialize_many(matched_foods), "restaurants": serialize_many(matched_restaurants)})


@app.get("/api/recommendations")
@role_required("customer")
def recommendations():
    user_id, _ = current_identity()
    recs = get_recommendations(user_id)
    return jsonify(serialize_many(recs))


# =========================================================================
# 4. FAVORITES
# =========================================================================
@app.get("/api/favorites")
@role_required("customer")
def list_favorites():
    user_id, _ = current_identity()
    favs = list(favorites.find({"user_id": user_id}))
    food_ids = [f["food_id"] for f in favs if f.get("food_id")]
    rest_ids = [f["restaurant_id"] for f in favs if f.get("restaurant_id")]
    return jsonify({
        "foods": serialize_many(foods.find({"food_id": {"$in": food_ids}})),
        "restaurants": serialize_many(restaurants.find({"restaurant_id": {"$in": rest_ids}})),
    })


@app.post("/api/favorites")
@role_required("customer")
def toggle_favorite():
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    query = {"user_id": user_id}
    if data.get("food_id"):
        query["food_id"] = data["food_id"]
    elif data.get("restaurant_id"):
        query["restaurant_id"] = data["restaurant_id"]
    else:
        return jsonify({"error": "food_id or restaurant_id required."}), 400

    existing = favorites.find_one(query)
    if existing:
        favorites.delete_one(query)
        log_user_activity(user_id, "UNFAVORITE", data)
        return jsonify({"favorited": False})
    favorites.insert_one({**query, "favorite_id": new_id("F"), "created_at": now()})
    log_user_activity(user_id, "FAVORITE", data)
    return jsonify({"favorited": True})


# =========================================================================
# 5. CART
# =========================================================================
@app.get("/api/cart")
@role_required("customer")
def get_cart():
    user_id, _ = current_identity()
    items = list(cart.find({"user_id": user_id}))
    return jsonify(serialize_many(items))


@app.post("/api/cart")
@role_required("customer")
def add_to_cart():
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    food = foods.find_one({"food_id": data.get("food_id")})
    if not food or not food.get("available", True):
        return jsonify({"error": "Food is currently unavailable."}), 400

    customizations = data.get("customizations", {})
    quantity = max(1, int(data.get("quantity", 1)))
    unit_price = food["price"] + sum(c.get("extra_price", 0) for c in customizations.get("addons", []))

    item = {
        "cart_item_id": new_id("C"),
        "user_id": user_id,
        "food_id": food["food_id"],
        "food_name": food["name"],
        "restaurant_id": food["restaurant_id"],
        "image": food.get("image", ""),
        "customizations": customizations,
        "quantity": quantity,
        "unit_price": unit_price,
        "calories": food.get("calories", 0),
        "protein": food.get("protein", 0),
        "created_at": now(),
    }
    cart.insert_one(item)
    log_user_activity(user_id, "ADD_TO_CART", {"food_id": food["food_id"]})
    return jsonify(serialize(item)), 201


@app.put("/api/cart/<cart_item_id>")
@role_required("customer")
def update_cart_item(cart_item_id):
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    quantity = max(1, int(data.get("quantity", 1)))
    cart.update_one({"cart_item_id": cart_item_id, "user_id": user_id}, {"$set": {"quantity": quantity}})
    return jsonify({"message": "Cart updated."})


@app.delete("/api/cart/<cart_item_id>")
@role_required("customer")
def remove_cart_item(cart_item_id):
    user_id, _ = current_identity()
    cart.delete_one({"cart_item_id": cart_item_id, "user_id": user_id})
    log_user_activity(user_id, "REMOVE_FROM_CART", {"cart_item_id": cart_item_id})
    return jsonify({"message": "Removed from cart."})


# =========================================================================
# 6. COUPONS
# =========================================================================
@app.post("/api/coupons/validate")
@role_required("customer")
def validate_coupon():
    data = request.get_json(force=True)
    coupon = coupons.find_one({"code": data.get("code", "").upper()})
    if not coupon:
        return jsonify({"error": "Invalid coupon code."}), 404
    if coupon.get("expires_at") and coupon["expires_at"] < now():
        return jsonify({"error": "Coupon has expired."}), 400
    return jsonify(serialize(coupon))


# =========================================================================
# 7. ORDERS / CHECKOUT
# =========================================================================
def compute_totals(items, coupon=None):
    subtotal = sum(i["unit_price"] * i["quantity"] for i in items)
    discount = 0
    if coupon:
        if coupon.get("type") == "percent":
            discount = subtotal * (coupon["value"] / 100)
        else:
            discount = coupon.get("value", 0)
    total = max(0, subtotal - discount) + Config.DELIVERY_FEE + Config.PLATFORM_FEE
    return round(subtotal, 2), round(discount, 2), round(total, 2)


def find_available_delivery_partner():
    return delivery_partners.find_one({"available": True, "blocked": False})


@app.post("/api/orders")
@role_required("customer")
def place_order():
    user_id, _ = current_identity()
    data = request.get_json(force=True)

    cart_items = list(cart.find({"user_id": user_id}))
    if not cart_items:
        return jsonify({"error": "Your cart is empty."}), 400

    coupon = None
    if data.get("coupon_code"):
        coupon = coupons.find_one({"code": data["coupon_code"].upper()})
        if not coupon or (coupon.get("expires_at") and coupon["expires_at"] < now()):
            return jsonify({"error": "Coupon has expired."}), 400

    subtotal, discount, total = compute_totals(cart_items, coupon)

    payment_method = data.get("payment_method", "COD")
    if payment_method == "WALLET":
        user = users.find_one({"user_id": user_id})
        if user.get("wallet_balance", 0) < total:
            return jsonify({"error": "Insufficient wallet balance."}), 400
        users.update_one({"user_id": user_id}, {"$inc": {"wallet_balance": -total}})

    restaurant_id = cart_items[0]["restaurant_id"]
    assigned_partner = find_available_delivery_partner()

    order_doc = {
        "order_id": new_id("O"),
        "user_id": user_id,
        "restaurant_id": restaurant_id,
        "delivery_partner_id": assigned_partner["delivery_partner_id"] if assigned_partner else None,
        "items": [{
            "food_id": i["food_id"], "food_name": i["food_name"],
            "customizations": i.get("customizations", {}), "quantity": i["quantity"],
            "unit_price": i["unit_price"], "calories": i.get("calories", 0), "protein": i.get("protein", 0),
        } for i in cart_items],
        "subtotal": subtotal,
        "delivery_fee": Config.DELIVERY_FEE,
        "platform_fee": Config.PLATFORM_FEE,
        "discount": discount,
        "total": total,
        "address": data.get("address", ""),
        "special_instructions": data.get("special_instructions", ""),
        "payment_method": payment_method,
        "payment_status": "PENDING" if payment_method == "ONLINE_MOCK" else "PAID" if payment_method == "WALLET" else "COD_PENDING",
        "status": "PLACED",
        "created_at": now(),
        "accepted_at": None, "picked_up_at": None, "out_for_delivery_at": None, "delivered_at": None,
    }
    orders.insert_one(order_doc)
    cart.delete_many({"user_id": user_id})

    log_user_activity(user_id, "PLACE_ORDER", {"order_id": order_doc["order_id"]})
    push_notification(user_id, "Order Confirmed! 🎉", f"Your order {order_doc['order_id']} has been placed.")

    if assigned_partner:
        push_notification(assigned_partner["delivery_partner_id"], "New delivery request",
                           f"Order {order_doc['order_id']} is ready for pickup.", category="delivery")
        log_delivery_activity(assigned_partner["delivery_partner_id"], "ORDER_RECEIVED", order_doc["order_id"])

    return jsonify(serialize(order_doc)), 201


@app.get("/api/orders")
@role_required("customer")
def list_orders():
    user_id, _ = current_identity()
    docs = list(orders.find({"user_id": user_id}).sort("created_at", -1))
    return jsonify(serialize_many(docs))


@app.get("/api/orders/<order_id>")
@role_required("customer")
def get_order(order_id):
    user_id, _ = current_identity()
    order = orders.find_one({"order_id": order_id, "user_id": user_id})
    if not order:
        return jsonify({"error": "Order not found."}), 404
    return jsonify(serialize(order))


@app.put("/api/orders/<order_id>/cancel")
@role_required("customer")
def cancel_order(order_id):
    user_id, _ = current_identity()
    order = orders.find_one({"order_id": order_id, "user_id": user_id})
    if not order:
        return jsonify({"error": "Order not found."}), 404
    if order["status"] in ("OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"):
        return jsonify({"error": "This order can no longer be cancelled."}), 400
    orders.update_one({"order_id": order_id}, {"$set": {"status": "CANCELLED"}})
    log_user_activity(user_id, "CANCEL_ORDER", {"order_id": order_id})
    return jsonify({"message": "Order cancelled."})


@app.get("/api/orders/<order_id>/tracking")
@role_required("customer")
def track_order(order_id):
    user_id, _ = current_identity()
    order = orders.find_one({"order_id": order_id, "user_id": user_id})
    if not order:
        return jsonify({"error": "Order not found."}), 404

    partner = None
    location = None
    if order.get("delivery_partner_id"):
        partner = delivery_partners.find_one({"delivery_partner_id": order["delivery_partner_id"]})
        # Only expose location while delivery is actively in progress
        if order["status"] in ("PICKED_UP", "OUT_FOR_DELIVERY"):
            loc = delivery_locations.find_one({"order_id": order_id}, sort=[("timestamp", -1)])
            if loc:
                location = {"latitude": loc["latitude"], "longitude": loc["longitude"], "timestamp": loc["timestamp"]}

    partner_public = None
    if partner:
        partner_public = {
            "name": partner["name"], "profile_image": partner.get("profile_image", ""),
            "rating": partner.get("rating", 5.0), "vehicle_type": partner.get("vehicle_type"),
            "phone": partner.get("phone"),
        }

    return jsonify({
        "order_id": order_id, "status": order["status"],
        "timeline": {
            "PLACED": order["created_at"], "CONFIRMED": order.get("accepted_at"),
            "PICKED_UP": order.get("picked_up_at"), "OUT_FOR_DELIVERY": order.get("out_for_delivery_at"),
            "DELIVERED": order.get("delivered_at"),
        },
        "delivery_partner": partner_public,
        "current_location": location,
    })


@app.post("/api/orders/<order_id>/review")
@role_required("customer")
def review_order(order_id):
    user_id, _ = current_identity()
    order = orders.find_one({"order_id": order_id, "user_id": user_id})
    if not order:
        return jsonify({"error": "Order not found."}), 404
    if order["status"] != "DELIVERED":
        return jsonify({"error": "Review can only be submitted after delivery."}), 400
    if reviews.find_one({"order_id": order_id}):
        return jsonify({"error": "You have already reviewed this order."}), 400

    data = request.get_json(force=True)
    review_doc = {
        "review_id": new_id("R"),
        "order_id": order_id,
        "user_id": user_id,
        "restaurant_id": order["restaurant_id"],
        "food_id": order["items"][0]["food_id"] if order["items"] else None,
        "delivery_partner_id": order.get("delivery_partner_id"),
        "food_rating": data.get("food_rating", 5),
        "restaurant_rating": data.get("restaurant_rating", 5),
        "delivery_rating": data.get("delivery_rating", 5),
        "text": data.get("text", ""),
        "image": data.get("image", ""),
        "helpful_count": 0,
        "reported": False,
        "created_at": now(),
    }
    reviews.insert_one(review_doc)

    if order.get("delivery_partner_id"):
        dp_reviews = list(reviews.find({"delivery_partner_id": order["delivery_partner_id"]}))
        avg = sum(r["delivery_rating"] for r in dp_reviews) / len(dp_reviews)
        delivery_partners.update_one({"delivery_partner_id": order["delivery_partner_id"]}, {"$set": {"rating": round(avg, 2)}})

    add_points(user_id, Config.POINTS_REVIEW, "Review submitted")
    log_user_activity(user_id, "REVIEW", {"order_id": order_id})
    return jsonify(serialize(review_doc)), 201


@app.get("/api/restaurants/<restaurant_id>/reviews")
def restaurant_reviews(restaurant_id):
    docs = list(reviews.find({"restaurant_id": restaurant_id}).sort("created_at", -1))
    return jsonify(serialize_many(docs))


# =========================================================================
# 8. DELIVERY PARTNER
# =========================================================================
@app.get("/api/delivery/profile")
@role_required("delivery")
def delivery_profile():
    dp_id, _ = current_identity()
    return jsonify(serialize(delivery_partners.find_one({"delivery_partner_id": dp_id})))


@app.put("/api/delivery/availability")
@role_required("delivery")
def set_availability():
    dp_id, _ = current_identity()
    data = request.get_json(force=True)
    available = bool(data.get("available", False))
    delivery_partners.update_one({"delivery_partner_id": dp_id}, {"$set": {"available": available}})
    log_delivery_activity(dp_id, "AVAILABLE" if available else "UNAVAILABLE")
    return jsonify({"available": available})


@app.get("/api/delivery/orders")
@role_required("delivery")
def delivery_orders():
    dp_id, _ = current_identity()
    # Orders assigned to this partner, not yet delivered/cancelled
    docs = list(orders.find({
        "delivery_partner_id": dp_id,
        "status": {"$nin": ["DELIVERED", "CANCELLED"]},
    }).sort("created_at", -1))

    # Trim to only what a delivery partner should see (never full customer profile)
    trimmed = []
    for o in docs:
        customer = users.find_one({"user_id": o["user_id"]})
        trimmed.append({
            "order_id": o["order_id"],
            "customer_name": customer["name"] if customer else "Customer",
            "address": o["address"],
            "items_summary": [f"{i['quantity']}x {i['food_name']}" for i in o["items"]],
            "total": o["total"],
            "special_instructions": o.get("special_instructions", ""),
            "status": o["status"],
            "created_at": o["created_at"],
        })
    return jsonify(trimmed)


@app.post("/api/delivery/orders/<order_id>/accept")
@role_required("delivery")
def accept_order(order_id):
    dp_id, _ = current_identity()
    order = orders.find_one({"order_id": order_id, "delivery_partner_id": dp_id})
    if not order:
        return jsonify({"error": "Delivery request not found."}), 404
    orders.update_one({"order_id": order_id}, {"$set": {"status": "CONFIRMED", "accepted_at": now()}})
    log_delivery_activity(dp_id, "ORDER_ACCEPTED", order_id)
    push_notification(order["user_id"], "Delivery partner assigned", "Your order has been accepted and is being prepared.")
    return jsonify({"message": "Order accepted."})


@app.post("/api/delivery/orders/<order_id>/reject")
@role_required("delivery")
def reject_order(order_id):
    dp_id, _ = current_identity()
    order = orders.find_one({"order_id": order_id, "delivery_partner_id": dp_id})
    if not order:
        return jsonify({"error": "Delivery request not found."}), 404
    fallback = find_available_delivery_partner()
    orders.update_one({"order_id": order_id}, {
        "$set": {"delivery_partner_id": fallback["delivery_partner_id"] if fallback else None}
    })
    log_delivery_activity(dp_id, "ORDER_REJECTED", order_id)
    return jsonify({"message": "Order reassigned."})


VALID_STATUS_FLOW = ["PLACED", "CONFIRMED", "PREPARING", "READY", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"]


@app.put("/api/delivery/orders/<order_id>/status")
@role_required("delivery")
def update_delivery_status(dp_id_param=None, order_id=None):
    dp_id, _ = current_identity()
    data = request.get_json(force=True)
    new_status = data.get("status")
    if new_status not in VALID_STATUS_FLOW:
        return jsonify({"error": "Invalid status."}), 400

    order = orders.find_one({"order_id": order_id, "delivery_partner_id": dp_id})
    if not order:
        return jsonify({"error": "Order not found."}), 404

    field_map = {"PICKED_UP": "picked_up_at", "OUT_FOR_DELIVERY": "out_for_delivery_at", "DELIVERED": "delivered_at"}
    update = {"status": new_status}
    if new_status in field_map:
        update[field_map[new_status]] = now()
    orders.update_one({"order_id": order_id}, {"$set": update})
    log_delivery_activity(dp_id, new_status, order_id)

    status_messages = {
        "PREPARING": "The restaurant has started preparing your order.",
        "READY": "Your order is ready and will be picked up shortly.",
        "PICKED_UP": "Your order has been picked up by the delivery partner.",
        "OUT_FOR_DELIVERY": "Your order is out for delivery — arriving soon!",
        "DELIVERED": "Your order has been delivered. Enjoy your meal!",
    }
    if new_status in status_messages:
        push_notification(order["user_id"], "Order update", status_messages[new_status])

    if new_status == "DELIVERED":
        delivery_partners.update_one({"delivery_partner_id": dp_id}, {
            "$inc": {"total_deliveries": 1, "earnings": round(order["total"] * 0.15, 2)}
        })
        add_points(order["user_id"], Config.POINTS_ORDER, "Order delivered")

    return jsonify({"message": f"Status updated to {new_status}."})


@app.post("/api/delivery/location")
@role_required("delivery")
def update_location():
    dp_id, _ = current_identity()
    data = request.get_json(force=True)
    order_id = data.get("order_id")
    order = orders.find_one({"order_id": order_id, "delivery_partner_id": dp_id})
    if not order or order["status"] not in ("PICKED_UP", "OUT_FOR_DELIVERY"):
        return jsonify({"error": "Location can only be shared during an active delivery."}), 400

    delivery_locations.insert_one({
        "order_id": order_id, "delivery_partner_id": dp_id,
        "latitude": data["latitude"], "longitude": data["longitude"], "timestamp": now(),
    })
    log_delivery_activity(dp_id, "LOCATION_UPDATED", order_id, location={"lat": data["latitude"], "lng": data["longitude"]})
    return jsonify({"message": "Location updated."})


@app.get("/api/delivery/earnings")
@role_required("delivery")
def delivery_earnings():
    dp_id, _ = current_identity()
    dp = delivery_partners.find_one({"delivery_partner_id": dp_id})
    completed = list(orders.find({"delivery_partner_id": dp_id, "status": "DELIVERED"}).sort("delivered_at", -1))
    return jsonify({
        "total_earnings": dp.get("earnings", 0),
        "total_deliveries": dp.get("total_deliveries", 0),
        "rating": dp.get("rating", 5.0),
        "recent_deliveries": [{
            "order_id": o["order_id"], "total": o["total"],
            "earning": round(o["total"] * 0.15, 2), "delivered_at": o.get("delivered_at"),
        } for o in completed[:20]],
    })


@app.get("/api/delivery/reviews")
@role_required("delivery")
def delivery_reviews():
    dp_id, _ = current_identity()
    docs = list(reviews.find({"delivery_partner_id": dp_id}).sort("created_at", -1))
    return jsonify(serialize_many(docs))


@app.get("/api/delivery/activity")
@role_required("delivery")
def delivery_activity_log():
    dp_id, _ = current_identity()
    docs = list(delivery_activity.find({"delivery_partner_id": dp_id}).sort("created_at", -1).limit(100))
    return jsonify(serialize_many(docs))


# =========================================================================
# 9. NOTIFICATIONS, ACTIVITY, REWARDS, BUDGET, NUTRITION (customer-facing)
# =========================================================================
@app.get("/api/notifications")
@jwt_required()
def get_notifications():
    ident, _ = current_identity()
    docs = list(notifications.find({"user_id": ident}).sort("created_at", -1).limit(50))
    return jsonify(serialize_many(docs))


@app.put("/api/notifications/<notification_id>/read")
@jwt_required()
def mark_notification_read(notification_id):
    ident, _ = current_identity()
    notifications.update_one({"notification_id": notification_id, "user_id": ident}, {"$set": {"read": True}})
    return jsonify({"message": "Marked as read."})


@app.get("/api/activity")
@role_required("customer")
def get_activity():
    user_id, _ = current_identity()
    docs = list(user_activity.find({"user_id": user_id}).sort("created_at", -1).limit(100))
    return jsonify(serialize_many(docs))


@app.get("/api/rewards")
@role_required("customer")
def get_rewards():
    user_id, _ = current_identity()
    user = users.find_one({"user_id": user_id})
    txns = list(reward_transactions.find({"user_id": user_id}).sort("created_at", -1).limit(50))
    return jsonify({"points": user.get("reward_points", 0), "transactions": serialize_many(txns)})


@app.post("/api/rewards/redeem")
@role_required("customer")
def redeem_rewards():
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    points_to_redeem = int(data.get("points", 0))
    user = users.find_one({"user_id": user_id})
    if user.get("reward_points", 0) < points_to_redeem or points_to_redeem <= 0:
        return jsonify({"error": "You do not have enough reward points."}), 400

    discount_value = points_to_redeem * 0.1  # 10 points = ₹1
    users.update_one({"user_id": user_id}, {"$inc": {"reward_points": -points_to_redeem, "wallet_balance": discount_value}})
    reward_transactions.insert_one({
        "transaction_id": new_id("RT"), "user_id": user_id, "points": -points_to_redeem,
        "reason": "Redeemed for wallet credit", "created_at": now(),
    })
    return jsonify({"message": f"Redeemed for ₹{discount_value} wallet credit."})


@app.get("/api/budget")
@role_required("customer")
def get_budget():
    user_id, _ = current_identity()
    user = users.find_one({"user_id": user_id})
    prefs = user.get("preferences", {})
    return jsonify({
        "daily_budget": prefs.get("daily_budget", 400),
        "monthly_budget": prefs.get("monthly_budget", 8000),
        "spent_today": budget_used_today(user_id),
    })


@app.get("/api/nutrition/today")
@role_required("customer")
def nutrition_today():
    user_id, _ = current_identity()
    today_start = datetime.combine(date.today(), datetime.min.time())
    todays_orders = orders.find({"user_id": user_id, "created_at": {"$gte": today_start}, "status": {"$ne": "CANCELLED"}})
    calories = protein = 0
    for o in todays_orders:
        for item in o.get("items", []):
            calories += item.get("calories", 0) * item.get("quantity", 1)
            protein += item.get("protein", 0) * item.get("quantity", 1)
    return jsonify({"calories": calories, "protein": protein})


# =========================================================================
# 10. FOOD RESCUE
# =========================================================================
@app.get("/api/food-rescue")
def list_food_rescue():
    docs = list(food_rescue.find({"available_until": {"$gte": now()}, "portions_left": {"$gt": 0}}))
    return jsonify(serialize_many(docs))


@app.post("/api/food-rescue")
@role_required("admin")
def create_food_rescue():
    """Restaurants list rescue food via admin/restaurant-management tooling."""
    data = request.get_json(force=True)
    doc = {
        "rescue_id": new_id("FR"),
        "restaurant_id": data["restaurant_id"],
        "food_name": data["food_name"],
        "image": data.get("image", ""),
        "normal_price": data["normal_price"],
        "rescue_price": data["rescue_price"],
        "portions_left": data["portions_left"],
        "available_until": data["available_until"],
        "created_at": now(),
    }
    food_rescue.insert_one(doc)
    return jsonify(serialize(doc)), 201


@app.post("/api/food-rescue/<rescue_id>/order")
@role_required("customer")
def order_food_rescue(rescue_id):
    user_id, _ = current_identity()
    item = food_rescue.find_one({"rescue_id": rescue_id})
    if not item or item["portions_left"] <= 0 or item["available_until"] < now():
        return jsonify({"error": "This Food Rescue item is no longer available."}), 400

    food_rescue.update_one({"rescue_id": rescue_id}, {"$inc": {"portions_left": -1}})
    partner = find_available_delivery_partner()
    order_doc = {
        "order_id": new_id("O"), "user_id": user_id, "restaurant_id": item["restaurant_id"],
        "delivery_partner_id": partner["delivery_partner_id"] if partner else None,
        "items": [{"food_id": rescue_id, "food_name": item["food_name"] + " (Food Rescue)",
                   "customizations": {}, "quantity": 1, "unit_price": item["rescue_price"], "calories": 0, "protein": 0}],
        "subtotal": item["rescue_price"], "delivery_fee": Config.DELIVERY_FEE, "platform_fee": Config.PLATFORM_FEE,
        "discount": 0, "total": item["rescue_price"] + Config.DELIVERY_FEE + Config.PLATFORM_FEE,
        "address": request.get_json(silent=True).get("address", "") if request.get_json(silent=True) else "",
        "payment_method": "COD", "payment_status": "COD_PENDING", "status": "PLACED",
        "is_food_rescue": True, "created_at": now(),
        "accepted_at": None, "picked_up_at": None, "out_for_delivery_at": None, "delivered_at": None,
    }
    orders.insert_one(order_doc)
    add_points(user_id, Config.POINTS_FOOD_RESCUE, "Food Rescue order")
    log_user_activity(user_id, "FOOD_RESCUE_ORDER", {"rescue_id": rescue_id})
    return jsonify(serialize(order_doc)), 201


# =========================================================================
# 11. GROUP ORDERS
# =========================================================================
@app.post("/api/groups")
@role_required("customer")
def create_group():
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    code = "FOOD-" + new_id("")[1:].replace("-", "")[:4].upper()
    doc = {
        "group_id": new_id("G"), "code": code, "creator_id": user_id,
        "restaurant_id": data.get("restaurant_id"), "members": [{"user_id": user_id, "name": data.get("name", "Host"), "items": []}],
        "status": "OPEN", "created_at": now(),
    }
    groups.insert_one(doc)
    add_points(user_id, Config.POINTS_GROUP_ORDER, "Group order created")
    return jsonify(serialize(doc)), 201


@app.post("/api/groups/join")
@role_required("customer")
def join_group():
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    group = groups.find_one({"code": data.get("code", "").upper(), "status": "OPEN"})
    if not group:
        return jsonify({"error": "Group order not found or already closed."}), 404
    groups.update_one({"group_id": group["group_id"]}, {
        "$push": {"members": {"user_id": user_id, "name": data.get("name", "Guest"), "items": []}}
    })
    return jsonify(serialize(groups.find_one({"group_id": group["group_id"]})))


@app.get("/api/groups/<group_id>")
@role_required("customer")
def get_group(group_id):
    group = groups.find_one({"group_id": group_id})
    if not group:
        return jsonify({"error": "Group not found."}), 404
    return jsonify(serialize(group))


@app.put("/api/groups/<group_id>/items")
@role_required("customer")
def update_group_items(group_id):
    user_id, _ = current_identity()
    data = request.get_json(force=True)
    groups.update_one(
        {"group_id": group_id, "members.user_id": user_id},
        {"$set": {"members.$.items": data.get("items", [])}},
    )
    return jsonify(serialize(groups.find_one({"group_id": group_id})))


@app.put("/api/groups/<group_id>/finalize")
@role_required("customer")
def finalize_group(group_id):
    user_id, _ = current_identity()
    group = groups.find_one({"group_id": group_id, "creator_id": user_id})
    if not group:
        return jsonify({"error": "Only the group creator can finalize this order."}), 403
    groups.update_one({"group_id": group_id}, {"$set": {"status": "FINALIZED"}})
    return jsonify({"message": "Group order finalized."})


# =========================================================================
# 12. ADMIN
# =========================================================================
@app.get("/api/admin/analytics")
@role_required("admin")
def admin_analytics():
    total_revenue = sum(o["total"] for o in orders.find({"status": "DELIVERED"}))
    return jsonify({
        "total_users": users.count_documents({}),
        "total_delivery_partners": delivery_partners.count_documents({}),
        "total_restaurants": restaurants.count_documents({}),
        "total_orders": orders.count_documents({}),
        "active_deliveries": orders.count_documents({"status": {"$in": ["PICKED_UP", "OUT_FOR_DELIVERY"]}}),
        "total_revenue": round(total_revenue, 2),
    })


@app.get("/api/admin/users")
@role_required("admin")
def admin_list_users():
    q = request.args.get("q", "")
    query = {"$or": [{"name": {"$regex": q, "$options": "i"}}, {"email": {"$regex": q, "$options": "i"}}]} if q else {}
    docs = list(users.find(query, {"password_hash": 0}))
    return jsonify(serialize_many(docs))


@app.put("/api/admin/users/<user_id>/block")
@role_required("admin")
def admin_block_user(user_id):
    data = request.get_json(force=True)
    users.update_one({"user_id": user_id}, {"$set": {"blocked": bool(data.get("blocked", True))}})
    return jsonify({"message": "User updated."})


@app.get("/api/admin/delivery-partners")
@role_required("admin")
def admin_list_partners():
    docs = list(delivery_partners.find({}, {"password_hash": 0}))
    return jsonify(serialize_many(docs))


@app.put("/api/admin/delivery-partners/<dp_id>/block")
@role_required("admin")
def admin_block_partner(dp_id):
    data = request.get_json(force=True)
    delivery_partners.update_one({"delivery_partner_id": dp_id}, {"$set": {"blocked": bool(data.get("blocked", True))}})
    return jsonify({"message": "Delivery partner updated."})


@app.get("/api/admin/restaurants")
@role_required("admin")
def admin_list_restaurants():
    return jsonify(serialize_many(restaurants.find({})))


@app.post("/api/admin/restaurants")
@role_required("admin")
def admin_create_restaurant():
    data = request.get_json(force=True)
    doc = {
        "restaurant_id": new_id("RS"), "name": data["name"], "cuisine": data.get("cuisine", ""),
        "image": data.get("image", ""), "logo": data.get("logo", ""), "delivery_time": data.get("delivery_time", 30),
        "price_range": data.get("price_range", "₹₹"), "rating": 4.5, "created_at": now(),
    }
    restaurants.insert_one(doc)
    return jsonify(serialize(doc)), 201


@app.post("/api/admin/foods")
@role_required("admin")
def admin_create_food():
    data = request.get_json(force=True)
    doc = {
        "food_id": new_id("FD"), "restaurant_id": data["restaurant_id"], "name": data["name"],
        "category": data.get("category", "Main Course"), "cuisine": data.get("cuisine", "Indian"),
        "food_type": data.get("food_type", "Vegetarian"), "price": data["price"], "image": data.get("image", ""),
        "rating": 4.5, "delivery_time": data.get("delivery_time", 30), "calories": data.get("calories", 400),
        "protein": data.get("protein", 15), "description": data.get("description", ""),
        "customizable": data.get("customizable", False), "has_offer": data.get("has_offer", False),
        "is_rescue_eligible": data.get("is_rescue_eligible", False), "available": True, "created_at": now(),
    }
    foods.insert_one(doc)
    return jsonify(serialize(doc)), 201


@app.get("/api/admin/orders")
@role_required("admin")
def admin_list_orders():
    status = request.args.get("status")
    query = {"status": status} if status else {}
    docs = list(orders.find(query).sort("created_at", -1).limit(200))
    return jsonify(serialize_many(docs))


@app.get("/api/admin/reviews")
@role_required("admin")
def admin_list_reviews():
    reported_only = request.args.get("reported") == "true"
    query = {"reported": True} if reported_only else {}
    return jsonify(serialize_many(reviews.find(query).sort("created_at", -1)))


@app.delete("/api/admin/reviews/<review_id>")
@role_required("admin")
def admin_delete_review(review_id):
    reviews.delete_one({"review_id": review_id})
    return jsonify({"message": "Review deleted."})


@app.post("/api/reviews/<review_id>/report")
@role_required("customer")
def report_review(review_id):
    reviews.update_one({"review_id": review_id}, {"$set": {"reported": True}})
    return jsonify({"message": "Review reported for moderation."})


@app.post("/api/reviews/<review_id>/helpful")
@jwt_required()
def mark_helpful(review_id):
    reviews.update_one({"review_id": review_id}, {"$inc": {"helpful_count": 1}})
    return jsonify({"message": "Thanks for the feedback."})


@app.post("/api/admin/coupons")
@role_required("admin")
def admin_create_coupon():
    data = request.get_json(force=True)
    doc = {
        "coupon_id": new_id("CP"), "code": data["code"].upper(), "type": data.get("type", "percent"),
        "value": data["value"], "expires_at": data.get("expires_at"), "created_at": now(),
    }
    coupons.insert_one(doc)
    return jsonify(serialize(doc)), 201


@app.get("/api/admin/coupons")
@role_required("admin")
def admin_list_coupons():
    return jsonify(serialize_many(coupons.find({})))


# ---- Health check --------------------------------------------------------
@app.get("/")
def home():
    return jsonify({
        "success": True,
        "message": "FoodFlow API is running!"
    })
    
    return jsonify({"status": "FoodFlow API is running.", "time": now().isoformat()})

if __name__ == "__main__":
    app.run(debug=Config.DEBUG, port=5000)
