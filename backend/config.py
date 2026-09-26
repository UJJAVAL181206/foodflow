"""
FoodFlow - Configuration
Loads all secrets/config from environment variables. Never hardcode secrets here.
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/foodflow")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET", "change-this-in-production")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = FLASK_ENV == "development"
    # Base delivery fee / platform fee used across order calculations
    DELIVERY_FEE = 30
    PLATFORM_FEE = 5
    # Reward point values
    POINTS_ORDER = 10
    POINTS_FOOD_RESCUE = 15
    POINTS_REVIEW = 5
    POINTS_GROUP_ORDER = 10
    POINTS_REFERRAL = 50
