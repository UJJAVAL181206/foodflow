"""
FoodFlow - Shared helpers
Password hashing, role-based access guards, activity logging, notifications,
id generation and the (rule-based) Smart Recommendation Engine.
"""
import uuid
import random
from datetime import datetime, date
from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, verify_jwt_in_request
from werkzeug.security import generate_password_hash, check_password_hash

from database import (
    users, foods, orders, notifications, user_activity, delivery_activity,
    delivery_partners, restaurants, reviews,
)


# ---- IDs ---------------------------------------------------------------
def new_id(prefix):
    """Short, readable unique ids e.g. FF-U-3F2A9C1B (never trust client-supplied ids)."""
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


def now():
    return datetime.utcnow()


# ---- Passwords -----------------------------------------------------------
def hash_password(raw):
    return generate_password_hash(raw)


def verify_password(raw, hashed):
    return check_password_hash(hashed, raw)


# ---- Role guards -----------------------------------------------------
def role_required(role):
    """Decorator: only allow requests whose JWT was issued with this role claim."""
    def wrapper(fn):
        @wraps(fn)
        def decorated(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") != role:
                return jsonify({"error": "Forbidden: wrong role for this endpoint."}), 403
            return fn(*args, **kwargs)
        return decorated
    return wrapper


# ---- Activity logging --------------------------------------------------
def log_user_activity(user_id, activity_type, metadata=None):
    user_activity.insert_one({
        "activity_id": new_id("UA"),
        "user_id": user_id,
        "activity_type": activity_type,
        "metadata": metadata or {},
        "created_at": now(),
    })


def log_delivery_activity(delivery_partner_id, activity_type, order_id=None, location=None, metadata=None):
    delivery_activity.insert_one({
        "activity_id": new_id("DA"),
        "delivery_partner_id": delivery_partner_id,
        "order_id": order_id,
        "activity_type": activity_type,
        "location": location,
        "metadata": metadata or {},
        "created_at": now(),
    })


def push_notification(user_id, title, message, category="general"):
    notifications.insert_one({
        "notification_id": new_id("N"),
        "user_id": user_id,
        "title": title,
        "message": message,
        "category": category,
        "read": False,
        "created_at": now(),
    })


# ---- Reward points -------------------------------------------------------
def add_points(user_id, points, reason):
    from database import reward_transactions
    reward_transactions.insert_one({
        "transaction_id": new_id("RT"),
        "user_id": user_id,
        "points": points,
        "reason": reason,
        "created_at": now(),
    })
    users.update_one({"user_id": user_id}, {"$inc": {"reward_points": points}})


# ---- Trust score (restaurant) ------------------------------------------
def calculate_trust_score(restaurant_id):
    """
    FoodFlow Trust Score (0-100) - our own internal metric, NOT an official
    industry rating. Rule-based blend of ratings, cancellation rate and volume.
    """
    rest_reviews = list(reviews.find({"restaurant_id": restaurant_id}))
    if not rest_reviews:
        base = 70
    else:
        avg_rating = sum(r.get("restaurant_rating", 4) for r in rest_reviews) / len(rest_reviews)
        base = (avg_rating / 5) * 100

    total_orders = orders.count_documents({"restaurant_id": restaurant_id})
    cancelled = orders.count_documents({"restaurant_id": restaurant_id, "status": "CANCELLED"})
    cancellation_rate = (cancelled / total_orders) if total_orders else 0

    score = base - (cancellation_rate * 40)
    score = max(0, min(100, round(score)))
    return score


# ---- Smart Recommendation Engine (rule-based) ---------------------------
def get_recommendations(user_id, limit=10):
    """
    Rule-based 'Smart Recommendation Engine'. Structured so a real ML model
    could later replace `score_food()` without changing the calling code.
    """
    user = users.find_one({"user_id": user_id}) or {}
    prefs = user.get("preferences", {})
    favorite_cuisines = set(prefs.get("favorite_cuisines", []))
    food_type = prefs.get("food_type")
    nutrition_goal = prefs.get("nutrition_goal")
    try:
        budget = float(prefs.get("daily_budget", 10_000))
    except (TypeError, ValueError):
        budget = 10_000

    past_orders = list(orders.find({"user_id": user_id}).sort("created_at", -1).limit(20))
    ordered_food_ids = set()
    for o in past_orders:
        for item in o.get("items", []):
            ordered_food_ids.add(item.get("food_id"))

    all_foods = list(foods.find({"available": True}))

    def score_food(f):
        s = 0
        if f.get("cuisine") in favorite_cuisines:
            s += 3
        if food_type and food_type != "No preference" and f.get("food_type") == food_type:
            s += 2
        if nutrition_goal == "High protein" and f.get("protein", 0) >= 20:
            s += 2
        if nutrition_goal == "Low calorie" and f.get("calories", 999) <= 400:
            s += 2
        if f.get("food_id") in ordered_food_ids:
            s += 1
        if f.get("price", 0) <= budget:
            s += 1
        s += random.random() * 0.3  # small jitter so ties don't always render identically
        return s

    scored = sorted(all_foods, key=score_food, reverse=True)
    return scored[:limit]


def budget_used_today(user_id):
    today_start = datetime.combine(date.today(), datetime.min.time())
    todays_orders = orders.find({
        "user_id": user_id,
        "created_at": {"$gte": today_start},
        "status": {"$ne": "CANCELLED"},
    })
    return sum(o.get("total", 0) for o in todays_orders)