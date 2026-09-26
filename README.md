# 🍔 FoodFlow — Full-Stack Food Delivery Platform

FoodFlow is a smart food-delivery web app: browsing, ordering, delivery-partner
tracking, reviews/ratings, a rule-based recommendation engine, Food Rescue,
Smart Budget mode, a nutrition dashboard, group ordering, rewards, and an
admin panel — built with **HTML/CSS/JS + Flask + MongoDB**.

This is the **lean, minimum-file build**: instead of 50+ separate HTML pages,
each role gets one consolidated, tab-based page (still backed by the full set
of real REST APIs and MongoDB collections described in the spec).

## Project layout

```
FoodFlow/
├── frontend/
│   ├── index.html        # Public home: browse, search, filters, login/register, food rescue
│   ├── dashboard.html     # Customer dashboard (cart, checkout, orders, tracking, rewards, etc.)
│   ├── delivery.html      # Delivery partner dashboard
│   ├── admin.html         # Admin dashboard
│   ├── css/style.css      # Shared design system, animations, dark mode
│   └── js/
│       ├── api.js         # Shared fetch wrapper, auth/session, toasts, modals
│       ├── main.js         # index.html logic
│       ├── dashboard.js    # customer dashboard logic
│       ├── delivery.js     # delivery partner logic
│       └── admin.js        # admin logic
├── backend/
│   ├── app.py              # All REST API routes
│   ├── config.py           # Env-driven configuration
│   ├── database.py         # MongoDB connection + collections + indexes
│   ├── helpers.py          # Auth, hashing, activity logs, recommendation engine
│   ├── seed.py              # Demo data seeding script
│   └── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

## 1. Prerequisites

- Python 3.10+
- MongoDB running locally (or a MongoDB Atlas connection string)
- A modern browser

## 2. Backend setup

```bash
cd FoodFlow/backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp ../.env.example .env         # then edit MONGO_URI / JWT_SECRET inside .env

python seed.py                  # populates demo restaurants, foods, accounts
python app.py                   # starts the API on http://localhost:5000
```

## 3. Frontend setup

The frontend is plain HTML/CSS/JS — no build step. Just open it with a local
static server so `fetch()` calls work cleanly:

```bash
cd FoodFlow/frontend
python -m http.server 5500
# then visit http://localhost:5500/index.html
```

`js/api.js` points at `http://localhost:5000/api` — change `API_BASE` there
if your Flask server runs elsewhere.

## 4. Demo accounts (from seed.py)

| Role             | Email                     | Password    |
|------------------|---------------------------|-------------|
| Customer         | demo@foodflow.demo        | demo123     |
| Delivery Partner | partner1@foodflow.demo    | password123 |
| Admin            | admin@foodflow.demo       | admin123    |

## 5. MongoDB collections

`users, delivery_partners, admins, restaurants, foods, orders, reviews, cart,
favorites, addresses, notifications, user_activity, delivery_activity,
delivery_locations, coupons, reward_transactions, wallet_transactions,
food_rescue, groups` — created and indexed automatically on first run
(`database.create_indexes()`).

## 6. API overview

All endpoints are under `/api`. Highlights:

- **Auth**: `POST /auth/register`, `/auth/login`, `/delivery/register`,
  `/delivery/login`, `/admin/login`
- **Browse**: `GET /foods`, `/restaurants`, `/search`, `/recommendations`
- **Cart/Checkout**: `POST /cart`, `POST /orders`
- **Tracking**: `GET /orders/<id>/tracking` (polling-based, not fake real-time)
- **Delivery partner**: `GET /delivery/orders`, `POST /delivery/orders/<id>/accept`,
  `PUT /delivery/orders/<id>/status`, `POST /delivery/location`
- **Reviews**: `POST /orders/<id>/review` (only after `DELIVERED`, one per order)
- **Rewards/Budget/Nutrition**: `/rewards`, `/budget`, `/nutrition/today`
- **Food Rescue**: `/food-rescue`
- **Groups**: `/groups`, `/groups/join`
- **Admin**: `/admin/analytics`, `/admin/users`, `/admin/orders`, etc.

See `backend/app.py` for the complete, commented list.

## 7. Smart Recommendation Engine

`helpers.get_recommendations()` is an explicit **rule-based** engine (favorite
cuisines, food type, nutrition goals, past orders, budget) — clearly labeled
as such in the UI, not marketed as machine learning. It's structured as a
single `score_food()` function so a real ML model could later replace it
without touching the calling code.

## 8. Security notes

- Passwords are hashed with Werkzeug's `generate_password_hash` — never
  stored in plain text.
- JWTs carry a `role` claim (`customer` / `delivery` / `admin`); every
  protected route uses `role_required()` to enforce it server-side.
- The backend always identifies the caller from the JWT (`get_jwt_identity()`)
  — it never trusts a client-supplied user id.
- Delivery partners only ever see the trimmed order/customer fields needed to
  deliver (`GET /delivery/orders`), never a customer's full profile.
- A customer's live delivery location is only exposed while the order is
  `PICKED_UP` / `OUT_FOR_DELIVERY`, and only for their own order.

## 9. Known limitations

- Tracking is REST + polling, not WebSockets (by design — see spec §60).
- Payment methods (`ONLINE_MOCK`) are mock only; no real payment gateway.
- The recommendation and restaurant Trust Score are simple, transparent
  rule-based formulas, not ML models.
- Image upload fields exist in the schema but the UI currently accepts only
  image URLs/emoji placeholders, not file uploads.

## 10. Future improvements

- Real-time order/location updates via Socket.IO.
- A real ML-based recommendation model behind the existing `get_recommendations()` interface.
- File-based image uploads (Pillow) for profile photos, food, and reviews.
- Payment gateway integration behind the existing `payment_method` field.
- Split `app.py` into Flask Blueprints as the codebase grows further.

## 11. Quick manual test checklist

- [ ] Register a customer, log in, set preferences
- [ ] Browse/search/filter food & restaurants
- [ ] Add to cart, apply a coupon (`WELCOME50`, `PIZZA20`), checkout
- [ ] As a delivery partner, go online, accept the order, advance its status
- [ ] Track the order as the customer, confirm location only shows once picked up
- [ ] Leave a review after delivery (and confirm a second review is blocked)
- [ ] Check reward points increased, redeem some for wallet credit
- [ ] Try Food Rescue, Group Order create/join
- [ ] Log in as admin, view analytics, block/unblock a user, add a coupon
