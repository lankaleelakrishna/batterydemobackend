# VOLTEX API

Backend for the VOLTEX inverter and battery marketplace. It serves the storefront in `../volten`.

- **Framework:** NestJS 10, Express
- **Database:** PostgreSQL 16 with TypeORM. Schema changes only through explicit migrations (`synchronize` is always off).
- **Auth:** JWT bearer tokens (issuer and audience checked), bcrypt passwords, token revocation on logout and deactivation.
- **Money:** stored as integer paise. Responses use rupees.

## Setup

```bash
npm install
cp .env.example .env          # then fill in PG_*, JWT_SECRET and the rest
npm run migration:run         # create the schema (never runs automatically)
npm run start:dev             # http://127.0.0.1:5000
```

`JWT_SECRET` must be at least 32 characters and must not be a placeholder. The API refuses to start otherwise.

## Business rules are not defaulted

Shipping fee, GST, minimum order, cash on delivery and serviceable pincodes are read from environment variables and have **no default**. Until they are set, `GET /store/settings` reports them as not configured and checkout returns `503 STORE_NOT_CONFIGURED`. No payment provider is integrated; orders are cash on delivery only, and only when `COD_ENABLED=true`.

## Demo data (development only)

```bash
SEED_DEMO_DATA=true DEMO_ADMIN_PASSWORD=... DEMO_CUSTOMER_PASSWORD=... npm run seed:demo
```

The seed refuses to run in production and only targets a database whose name contains `volten`. Its brands, products and testimonials are fictional and labelled as demo data. It is idempotent.

## Tests

```bash
npm test                      # unit tests: pricing, cart merge, checkout rules, config, catalogue rules
PG_DATABASE=volten_test npm run test:e2e   # 101 end-to-end tests against PostgreSQL
```

The end-to-end suite refuses any database whose name does not contain `test`. It covers catalogue filters and search, authentication and authorisation, cart and wishlist merging, checkout (server-side totals, stock validation, idempotency, and concurrent purchase of the last unit), reviews, admin operations and order status rules.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
```

## API overview

All responses share one error shape: `{ statusCode, code, message, details?, path, timestamp }`. Lists are `{ data, meta }`.

| Area | Routes |
| --- | --- |
| Health | `GET /health` |
| Catalogue (public) | `GET /products` (filters, search, sort, paging, `ids`), `GET /products/facets`, `GET /products/featured`, `GET /products/best-sellers`, `GET /products/suggest`, `GET /products/:slug`, `GET /products/:slug/components` |
| Taxonomy (public) | `GET /brands`, `GET /categories` (top level; `?parent=slug` for subcategories) |
| Content (public) | `GET /testimonials`, `POST /newsletter/subscribe`, `GET /products/:slug/reviews`, `POST /products/:slug/reviews` (signed in), `DELETE /reviews/:id` |
| Store (public) | `GET /store/settings`, `GET /store/pincodes/:pincode` |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Customer (signed in) | `GET/PUT /me`, `PUT /me/password`, `GET/POST /me/addresses`, `PUT/DELETE /me/addresses/:id` |
| Cart and wishlist (signed in) | `GET /cart`, `PUT/DELETE /cart/items/:productId`, `POST /cart/merge`, `GET /wishlist`, `PUT/DELETE /wishlist/:productId`, `POST /wishlist/merge` |
| Orders (signed in) | `POST /orders/quote`, `POST /orders` (requires `Idempotency-Key`), `GET /orders`, `GET /orders/:id` |
| Admin (role `admin`) | `GET /admin/dashboard`, `GET/POST /admin/products`, `GET/PUT /admin/products/:id`, `POST /admin/products/:id/archive` and `/restore`, `PUT /admin/products/:id/components`, `POST/DELETE /admin/products/:id/images`, `POST /admin/products/:id/inventory-adjustments`, `GET /admin/inventory-movements`, brands and categories CRUD, `GET/PATCH/DELETE /admin/reviews`, testimonials CRUD, `GET /admin/newsletter-subscribers`, `GET /admin/customers`, `PATCH /admin/customers/:id`, `GET /admin/orders`, `GET/PATCH /admin/orders/:id` |

## Project layout

```
src/
  config/             environment loading and validation
  common/             auth guard, errors, pagination, money, pricing, uploads
  database/           entities, data source, migrations, demo seed
  modules/            auth, users, brands, categories, products, content,
                      cart, wishlist, orders, store, admin
test/e2e/             end-to-end tests (real HTTP, real PostgreSQL)
```
