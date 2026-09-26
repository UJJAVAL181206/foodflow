"""
FoodFlow - Database layer
Single place that owns the PyMongo client and every collection handle,
plus index creation. Import `db` collections from here everywhere else.
"""
from pymongo import MongoClient, ASCENDING, DESCENDING
from config import Config

client = MongoClient(Config.MONGO_URI)
db = client.get_database()

# ---- Collections -----------------------------------------------------
users = db["users"]
delivery_partners = db["delivery_partners"]
admins = db["admins"]
restaurants = db["restaurants"]
foods = db["foods"]
categories = db["categories"]
orders = db["orders"]
reviews = db["reviews"]
cart = db["cart"]
favorites = db["favorites"]
addresses = db["addresses"]
notifications = db["notifications"]
user_activity = db["user_activity"]
delivery_activity = db["delivery_activity"]
delivery_locations = db["delivery_locations"]
coupons = db["coupons"]
reward_transactions = db["reward_transactions"]
wallet_transactions = db["wallet_transactions"]
food_rescue = db["food_rescue"]
groups = db["groups"]
support_tickets = db["support_tickets"]


def create_indexes():
    """Create indexes for fast, common lookups. Safe to call repeatedly."""
    users.create_index([("email", ASCENDING)], unique=True)
    users.create_index([("phone", ASCENDING)])
    delivery_partners.create_index([("email", ASCENDING)], unique=True)
    admins.create_index([("email", ASCENDING)], unique=True)
    foods.create_index([("name", ASCENDING)])
    foods.create_index([("restaurant_id", ASCENDING)])
    orders.create_index([("user_id", ASCENDING)])
    orders.create_index([("delivery_partner_id", ASCENDING)])
    orders.create_index([("status", ASCENDING)])
    orders.create_index([("created_at", DESCENDING)])
    reviews.create_index([("restaurant_id", ASCENDING)])
    reviews.create_index([("food_id", ASCENDING)])
    reviews.create_index([("order_id", ASCENDING)], unique=True)
    notifications.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    user_activity.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    delivery_activity.create_index([("delivery_partner_id", ASCENDING), ("created_at", DESCENDING)])
    delivery_locations.create_index([("order_id", ASCENDING)])
    food_rescue.create_index([("restaurant_id", ASCENDING)])
    groups.create_index([("code", ASCENDING)], unique=True)
