"""
FoodFlow - Seed Data
Run:  python seed.py
Populates MongoDB with demo restaurants, foods, a delivery partner, an admin,
a demo customer, coupons and a Food Rescue listing so the app is usable
immediately after setup.
"""
from datetime import datetime, timedelta

from database import (
    restaurants, foods, delivery_partners, admins, users, coupons,
    food_rescue, reviews,
)
from helpers import new_id, hash_password, now


def seed():
    print("Clearing old demo-safe collections...")
    for col in [restaurants, foods, delivery_partners, admins, coupons, food_rescue]:
        col.delete_many({})

    # ---- Restaurants -----------------------------------------------------
    restaurant_specs = [
        ("Spice Villa", "North Indian", 30),
        ("Pizza House", "Italian", 25),
        ("Dosa Corner", "South Indian", 20),
        ("Green Bowl", "Healthy", 22),
        ("Burger Barn", "Fast Food", 18),
        ("Wok This Way", "Chinese", 28),
        ("Taco Fiesta", "Mexican", 26),
        ("Thali House", "North Indian", 35),
        ("Momo Point", "Tibetan", 15),
        ("Sweet Treats", "Desserts", 20),
    ]
    restaurant_ids = []
    for name, cuisine, dtime in restaurant_specs:
        doc = {
            "restaurant_id": new_id("RS"), "name": name, "cuisine": cuisine,
            "image": "", "logo": "", "delivery_time": dtime, "price_range": "₹₹",
            "rating": 4.3, "created_at": now(),
        }
        restaurants.insert_one(doc)
        restaurant_ids.append(doc["restaurant_id"])

    # ---- Foods (40+) ------------------------------------------------------
    food_catalog = [
        ("Paneer Tikka", "North Indian", "Vegetarian", 189, 420, 24, "Starters"),
        ("Chicken Biryani", "North Indian", "Non-Vegetarian", 249, 650, 32, "Main Course"),
        ("Masala Dosa", "South Indian", "Vegetarian", 99, 380, 8, "Main Course"),
        ("Margherita Pizza", "Italian", "Vegetarian", 299, 720, 18, "Pizza"),
        ("Pepperoni Pizza", "Italian", "Non-Vegetarian", 349, 810, 26, "Pizza"),
        ("Veg Burger", "Fast Food", "Vegetarian", 129, 450, 10, "Burgers"),
        ("Chicken Burger", "Fast Food", "Non-Vegetarian", 169, 560, 22, "Burgers"),
        ("Chole Bhature", "North Indian", "Vegetarian", 149, 580, 14, "Main Course"),
        ("Rajma Rice", "North Indian", "Vegetarian", 139, 480, 16, "Main Course"),
        ("Veg Thali", "North Indian", "Vegetarian", 199, 700, 20, "Main Course"),
        ("Chicken Momos", "Tibetan", "Non-Vegetarian", 119, 320, 18, "Starters"),
        ("Veg Momos", "Tibetan", "Vegetarian", 99, 260, 8, "Starters"),
        ("Veg Pasta", "Italian", "Vegetarian", 219, 520, 12, "Main Course"),
        ("Club Sandwich", "Fast Food", "Vegetarian", 119, 380, 11, "Starters"),
        ("Veg Samosa (2pc)", "North Indian", "Vegetarian", 49, 260, 5, "Starters"),
        ("Mango Lassi", "North Indian", "Vegetarian", 79, 210, 4, "Drinks"),
        ("Cold Coffee", "Fast Food", "Vegetarian", 89, 190, 3, "Drinks"),
        ("Gulab Jamun (2pc)", "North Indian", "Vegetarian", 69, 310, 3, "Desserts"),
        ("Hakka Noodles", "Chinese", "Vegetarian", 159, 460, 10, "Main Course"),
        ("Chilli Chicken", "Chinese", "Non-Vegetarian", 219, 480, 28, "Starters"),
        ("Fried Rice", "Chinese", "Vegetarian", 149, 440, 9, "Main Course"),
        ("Chicken Tacos", "Mexican", "Non-Vegetarian", 199, 410, 22, "Main Course"),
        ("Veg Burrito Bowl", "Mexican", "Vegetarian", 189, 390, 14, "Main Course"),
        ("Grilled Chicken Salad", "Healthy", "Non-Vegetarian", 229, 320, 34, "Starters"),
        ("Quinoa Protein Bowl", "Healthy", "Vegan", 259, 380, 22, "Main Course"),
        ("Sprouts Salad", "Healthy", "Vegan", 129, 210, 15, "Starters"),
        ("Paneer Butter Masala", "North Indian", "Vegetarian", 219, 560, 19, "Main Course"),
        ("Butter Chicken", "North Indian", "Non-Vegetarian", 269, 620, 30, "Main Course"),
        ("Idli Sambar", "South Indian", "Vegetarian", 79, 260, 7, "Main Course"),
        ("Uttapam", "South Indian", "Vegetarian", 109, 340, 9, "Main Course"),
        ("Egg Fried Rice", "Chinese", "Egg", 159, 420, 16, "Main Course"),
        ("Veg Spring Rolls", "Chinese", "Vegetarian", 129, 300, 7, "Starters"),
        ("Chicken Shawarma Roll", "Fast Food", "Non-Vegetarian", 149, 470, 24, "Starters"),
        ("Paneer Roll", "North Indian", "Vegetarian", 119, 390, 13, "Starters"),
        ("Veggie Supreme Pizza", "Italian", "Vegetarian", 329, 700, 17, "Pizza"),
        ("Choco Lava Cake", "Desserts", "Vegetarian", 99, 380, 5, "Desserts"),
        ("Vanilla Ice Cream", "Desserts", "Vegetarian", 79, 230, 3, "Desserts"),
        ("High-Protein Paneer Bowl", "Healthy", "Vegetarian", 239, 400, 28, "Main Course"),
        ("Grilled Fish", "Healthy", "Non-Vegetarian", 289, 350, 36, "Main Course"),
        ("Veg Hakka Noodles Bowl", "Chinese", "Vegan", 169, 430, 9, "Main Course"),
        ("Mexican Rice Bowl", "Mexican", "Vegetarian", 179, 400, 11, "Main Course"),
        ("Cheese Garlic Bread", "Italian", "Vegetarian", 139, 410, 9, "Starters"),
    ]
    for i, (name, cuisine, food_type, price, cal, protein, category) in enumerate(food_catalog):
        rid = restaurant_ids[i % len(restaurant_ids)]
        foods.insert_one({
            "food_id": new_id("FD"), "restaurant_id": rid, "name": name, "category": category,
            "cuisine": cuisine, "food_type": food_type, "price": price, "image": "",
            "rating": round(4.0 + (i % 10) / 10, 1), "delivery_time": 20 + (i % 4) * 5,
            "calories": cal, "protein": protein,
            "description": f"Delicious {name} made fresh to order.",
            "customizable": food_type != "Desserts",
            "has_offer": i % 5 == 0, "is_rescue_eligible": i % 7 == 0,
            "available": True, "created_at": now(),
        })

    # ---- Delivery partners (10) --------------------------------------------
    for i in range(1, 11):
        delivery_partners.insert_one({
            "delivery_partner_id": new_id("D"), "name": f"Delivery Partner {i}",
            "email": f"partner{i}@foodflow.demo", "phone": f"98765{10000+i}",
            "password_hash": hash_password("password123"), "profile_image": "",
            "vehicle_type": "Bike" if i % 2 == 0 else "Scooter", "vehicle_number": f"MP04AB{1000+i}",
            "id_verification": "verified", "available": i <= 5, "rating": 4.5,
            "total_deliveries": 0, "earnings": 0, "blocked": False, "created_at": now(),
        })

    # ---- Admin --------------------------------------------------------------
    admins.insert_one({
        "admin_id": new_id("AD"), "name": "FoodFlow Admin", "email": "admin@foodflow.demo",
        "password_hash": hash_password("admin123"), "created_at": now(),
    })

    # ---- Demo customer --------------------------------------------------------
    if not users.find_one({"email": "demo@foodflow.demo"}):
        users.insert_one({
            "user_id": new_id("U"), "name": "Rahul Sharma", "email": "demo@foodflow.demo",
            "phone": "9998887770", "password_hash": hash_password("demo123"), "dob": "1998-05-14",
            "profile_image": "",
            "preferences": {
                "food_type": "Vegetarian", "favorite_cuisines": ["North Indian", "Italian"],
                "food_goals": ["High protein", "Budget friendly"], "spice_level": "Medium",
                "daily_budget": 400, "monthly_budget": 8000, "allergies": [], "nutrition_goal": "High protein",
            },
            "reward_points": 120, "wallet_balance": 100, "blocked": False, "created_at": now(),
        })

    # ---- Coupons --------------------------------------------------------
    coupons.insert_one({"coupon_id": new_id("CP"), "code": "WELCOME50", "type": "flat", "value": 50,
                         "expires_at": now() + timedelta(days=30), "created_at": now()})
    coupons.insert_one({"coupon_id": new_id("CP"), "code": "PIZZA20", "type": "percent", "value": 20,
                         "expires_at": now() + timedelta(days=15), "created_at": now()})

    # ---- Food Rescue --------------------------------------------------------
    sample_food = foods.find_one({})
    food_rescue.insert_one({
        "rescue_id": new_id("FR"), "restaurant_id": restaurant_ids[0], "food_name": "Paneer Rice Bowl",
        "image": "", "normal_price": 180, "rescue_price": 99, "portions_left": 7,
        "available_until": now() + timedelta(hours=5), "created_at": now(),
    })

    print("✅ Seed complete.")
    print("Demo customer  -> demo@foodflow.demo / demo123")
    print("Demo delivery  -> partner1@foodflow.demo / password123")
    print("Demo admin     -> admin@foodflow.demo / admin123")


if __name__ == "__main__":
    seed()
