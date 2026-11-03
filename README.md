![CADNA Mart](./CadnaMartLogo.png)

# CADNA Mart Backend

CADNA Mart is a multi-vendor marketplace for buyers to discover and purchase products from independent sellers. Sellers apply to join, verify their identity and payout details, manage product listings and fulfil orders. Marketplace administrators manage seller and product review, delivery configuration, customer requests and other operating workflows.

This repository contains the marketplace API and backend domain logic. It is built with NestJS 11 and TypeScript, and stores application data in PostgreSQL through Prisma. It also contains integrations for identity, email, payments, file storage, messaging and courier services. Provider code being present does not by itself mean that credentials, account permissions, live delivery or production operations have been verified.

Product intent was checked against the locally supplied product overview and seller product designs. Those documents include older database and deployment information; the current source, Prisma schema and migrations are the authority for implementation details. Local design, planning and agent files are intentionally kept out of Git; this root README is the repository's maintained product and engineering guide.

## What the backend provides

The API is organized around these product areas:

| Area | Implemented backend capabilities |
| --- | --- |
| Identity and accounts | Email registration and OTP verification, password sign-in and reset, JWT access/refresh tokens, optional two-factor authentication, Clerk buyer sign-in/linking/webhooks, profiles, addresses, account roles and account activity records. |
| Buyer privacy | Buyer data export and deletion requests, admin review, erasure/anonymization, documented retention holds with an owner-supplied lawful basis/purpose/deadline, manual expiry purge and requester-notice retry. No legal retention period is invented by the API. |
| Seller onboarding and KYC | Seller applications on an existing account, individual or registered-business details, private application documents, bank-account lookup/name check, StackAPI identity/CAC checks with explicit consent, review history and admin review. |
| Catalogue and discovery | Categories, products, variants, brands, collections, home rails, banners, product policies, search/autocomplete, seller storefronts, recently viewed items and media upload. |
| Seller product operations | Product drafts and edits, publication/sales/recommendation controls, duplication, product images, sales summaries, confirmed pickup address, and CSV bulk-import template, preview and commit. Bulk import creates drafts and reports row-level validation results; it does not update existing products. |
| Buyer shopping | Guest and signed-in carts, cart validation/merge, wishlist, address management, checkout sessions, delivery selection, order creation/history, order documents and order actions. |
| Orders and money | Inventory reservations and expiry, Paystack payment initialize/verify and webhook handling, payment-on-delivery routes, cancellation/return review, Paystack refund processing/reconciliation, and wallet records/transactions. |
| Delivery | CADNA-configured delivery zones/rates and delivery modes, StackAPI courier categories/quotes/bookings/tracking/cancellation, separate shipment groups for seller and courier category, and admin delivery coverage/provider controls. |
| Reviews and support | Delivered-order review eligibility, optional review photo, one helpful vote per buyer, seller replies and review reports; buyer/seller support tickets, attachments, REST thread access, Socket.IO updates, admin replies/status handling, and a separate email-only public contact form. |
| Notifications and other marketplace services | In-app notifications and preference/device APIs, best-effort email/SMS/push integrations, newsletter, deals, promotional slots, seller follows, partners, rewards, suppliers and admin reporting/configuration. |

These are backend capabilities. This README does not claim that a separate client application is wired to every route or that a live provider account has been validated.

## How a typical marketplace flow works

### Buyer

1. A buyer registers with email and verifies it with an OTP, or signs in through the configured Clerk flow. The API issues its own access and refresh tokens for protected API calls.
2. The buyer browses public product, category, seller and search routes, then uses a signed-in cart or a guest cart protected by a server-issued `x-guest-token`.
3. Checkout validates the cart and address, presents available delivery choices and creates an order. Product inventory is reserved when the order is placed. An unpaid order expires after 30 minutes and releases its reservation.
4. Paystack payment is initialized and verified by the backend or payment webhook. If a successful payment arrives after the order has expired and stock is no longer reserved, the order is flagged for manual review instead of silently reactivating inventory.
5. The buyer can view order status, delivery tracking, request a cancellation or return where supported, review an eligible delivered purchase, and contact support.

### Seller

1. A verified user starts an individual or registered-business seller application using the same account. Buyer access remains on the account; seller permissions are granted only after approval.
2. The applicant supplies the required identity/business documents, confirms payout details through the configured Paystack or Nomba bank-verification provider, and submits identity data to StackAPI only after recording consent.
3. StackAPI test mode is the default. Test results do not trigger automatic approval. Live KYC checks require explicit live-mode configuration and may incur provider charges. Outcomes that need judgment or cannot be safely mapped remain for admin review.
4. Applicants can prepare private product drafts. Approved sellers can manage products, variants, images, stock, sale/publication state, recommendations and pickup address. A product cannot become buyer-visible until the seller is approved and the product is made Live.
5. Sellers can import new products from CSV by requesting a template, previewing the file and committing a valid batch. Each variant is represented by a row. Import is create-only and creates drafts; review row errors before commit.
6. Sellers can manage their order/return work through the seller routes. Payout disbursement is not implemented as an automated seller payout flow.

### Support and operations

- Signed-in buyers and sellers create role-scoped tickets. Ticket messages can be sent over REST or the `/support` Socket.IO namespace. Admin replies and status changes are persisted and published through a database outbox; clients can use the REST message history to catch up after reconnecting.
- A buyer can withdraw a ticket, which hides it from the buyer list while retaining the support record. The public contact form accepts name, email, subject and message and sends email; it does not create a guest support ticket.
- Admin routes cover seller and product applications/moderation, user access, data-request processing, reviews/reports, orders/returns, delivery configuration, pricing, rewards and other operations. The API enforces admin/account-type access at route boundaries.

## Database and persistence

- PostgreSQL is the application database. Prisma models and versioned SQL migrations are in `prisma/`.
- Use `DATABASE_URL` for Prisma migrations (a direct Neon connection in the hosted setup) and `DATABASE_URL_POOLED` for the API and PostgreSQL-backed sessions (the Neon pooled connection). Both should point to the same database. The runtime falls back to `DATABASE_URL` if the pooled value is absent.
- This is a new database setup; this repository does not import user or business data from the previous MongoDB database.
- `npm run db:migrate:deploy` applies committed migrations to the database selected by the environment. Verify the target before running it. `npm run db:migrate:status` reports migration state; `npm run db:migrate:dev` is for local schema development.
- Support chat uses a database outbox for committed events, but the Socket.IO room adapter is process-local. The current support gateway is intended for a single API instance; multi-instance operation needs a shared Socket.IO adapter.
- The order-expiry processor runs on application startup and then once per minute within each API process. A live deployment still needs runtime verification to confirm the process is running and the database is reachable.

## Runtime and API conventions

- Default API prefix/version: `/api/v1` (configured by `API_PREFIX` and `API_DEFAULT_VERSION`). The default port is `3000` (`APP_PORT`); `PORT`, when present, takes precedence.
- Health routes: `GET /api/v1/health` and `GET /api/v1/health/db`.
- Swagger UI and its OpenAPI JSON are mounted at `/api/docs` and `/api/openapi.json` when enabled. They are disabled in production unless `ENABLE_SWAGGER=true`.
- Successful HTTP responses use the global `{ success, statusCode, data, meta }` envelope. Errors pass through the global exception filter and include an HTTP status, message, error code/name and correlation ID where available.
- Protected routes use `Authorization: Bearer <token>`. Account-type guards enforce buyer, seller, supplier, partner or admin access where declared. Guest-cart routes use `x-guest-token`; public catalogue/health/contact routes are explicitly marked public.
- Global request validation transforms inputs and rejects unknown fields. The app also configures CORS, Helmet, compression, cookie parsing, PostgreSQL-backed sessions, request throttling, request logging and correlation IDs.
- `POST /support/contact` is public and rate-limited. The public buyer cart flow is separate from the authenticated cart flow.

Use the generated Swagger document or the owning controller/DTO as the exact endpoint and payload contract. Avoid relying on old copied endpoint lists or sample payloads.

## Local development

### Prerequisites

- Node.js and npm compatible with the project lockfile.
- Docker Desktop, or Docker Engine with the Compose plugin, for the containerized local setup.
- For development without Docker, a reachable PostgreSQL database. The Docker Compose setup supplies its own local database; do not point local schema experiments at production.
- Values for the required database, JWT and session settings. Integrations can remain unconfigured unless the flow being developed needs them.

### Start the API

```bash
cp -n .env.example .env
npm ci
# Edit .env: set DATABASE_URL, strong JWT_ACCESS_SECRET,
# JWT_REFRESH_SECRET and SESSION_SECRET values (at least 32 characters).
npm run db:migrate:deploy
npm run start:dev
```

The example file includes the required core settings as placeholders; replace each with a distinct random value before starting the app. Check `src/config/config.schema.ts` for the full validated environment contract. The application loads `.env.<NODE_ENV>` first and then fills missing values from `.env`.

To generate suitable local random secrets, run this command once for each JWT/session secret and copy the output into your ignored `.env`:

```bash
openssl rand -hex 32
```

### Local PostgreSQL with Docker

Create `.env` from `.env.example` and set the required JWT and session secrets described above. The Docker Compose development stack supplies its own local PostgreSQL database and overrides both database URLs inside the app container, so the Neon placeholders in `.env.example` are not used by this local stack. Third-party provider credentials are only needed when exercising those integrations.

```bash
npm run docker:dev
```

Compose waits until PostgreSQL is healthy, generates the Prisma client, applies committed migrations to the local database, then starts NestJS in watch mode. Open the API at `http://localhost:3000/api/v1`; the local database is also available on `127.0.0.1:5433` for database tools. The app container connects to PostgreSQL over the private Compose network.

Stop the development services with:

```bash
npm run docker:dev:down
```

The down command removes Compose volumes (`-v`), including all local database contents. The development database is separate from Neon and is not a place to store shared or production data.

## Configuration reference

The validated schema is `src/config/config.schema.ts`; `.env.example` contains provider setup notes and safe placeholders. Never put real values in the example file, source code, logs, README, or Git.

| Variable group | Keys | Purpose |
| --- | --- | --- |
| Core runtime | `NODE_ENV`, `PORT`, `APP_PORT`, `APP_NAME`, `API_PREFIX`, `API_DEFAULT_VERSION`, `CORS_ORIGIN`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `LOG_LEVEL`, `ENABLE_SWAGGER` | Process mode, listener, routing, allowed browser origins, request limits, logging and optional API docs. |
| Database and auth | `DATABASE_URL`, `DATABASE_URL_POOLED`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRATION`, `SESSION_SECRET`, `SESSION_MAX_AGE` | Prisma PostgreSQL access, API tokens and server-side session signing/lifetime. Database URL values are confidential. |
| Email and identity | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_LOGO_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `CLERK_JWT_KEY` | Email delivery and Clerk buyer identity/webhook verification. |
| StackAPI | `STACKAPI_SECRET_KEY`, `STACKAPI_API_KEY` (legacy fallback), `STACKAPI_PUBLIC_KEY`, `STACKAPI_LOGISTICS_BASE_URL`, `STACKAPI_KYC_MODE`, `STACKAPI_KYC_LIVE_ENABLED`, `STACKAPI_KYC_TEST_SECRET_KEY`, `STACKAPI_KYC_LIVE_SECRET_KEY`, `STACKAPI_KYC_TEST_PUBLIC_KEY`, `STACKAPI_KYC_LIVE_PUBLIC_KEY`, `STACKAPI_KYC_CONSENT_VERSION`, `LOGISTICS_ALERT_EMAIL` | SMS, courier logistics, identity verification and delivery-booking alerts. Keep test and live KYC credentials separate; test is the default. |
| Payments and bank verification | `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `PAYSTACK_CALLBACK_URL`, `SELLER_BANK_VERIFICATION_PROVIDER`, `NOMBA_ACCOUNT_ID`, `NOMBA_CLIENT_ID`, `NOMBA_CLIENT_SECRET`, `SELLER_PII_ENCRYPTION_KEY` | Paystack order/refund flow and webhook verification, seller bank lookup through Paystack or Nomba, and encryption of seller payout/identity data. |
| Media and push | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `FCM_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` | Media and private document storage, plus Firebase push delivery. Protect service-account files and use workload identity where available. |
| Deals | `DEALS_FEE_PER_PRODUCT`, `DEALS_MAX_PRODUCTS` | Limits/default fee used by seller deal-campaign logic. |

`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `SESSION_SECRET` are required by configuration validation. Provider credentials are only needed for the associated integration and may be deliberately absent in local development. Consult the config schema and the `.env.example` comments before enabling a provider.

## Payments, delivery and integration boundaries

- Paystack order initialization and verification are implemented; signed payment/refund webhook handlers are present. The backend must receive and validate the raw webhook body. Provider credentials, webhook configuration and real-money behavior still require environment-specific verification.
- Paystack refund processing reserves refundable balance and waits for a matching provider result; an accepted/queued refund is not treated as completed. Some ambiguous outcomes need operator reconciliation.
- Pay-on-delivery routes exist. Stripe routes are placeholders; automated seller payout disbursement, wallet top-up and wallet transfer are not provided as completed money movement flows.
- StackAPI Logistics integration can request courier categories and quotes, create/cancel bookings and refresh tracking. Quotes require complete seller pickup/buyer delivery addresses and product parcel category, weight and dimensions. The checkout splits courier groups by seller and courier category; it does not invent a fallback courier price when a live quote is unavailable.
- CADNA-configured delivery modes, coverage, zones and rate tables are maintained through admin routes. Courier quote availability and real shipment booking depend on StackAPI key permissions and provider responses.
- Seller identity checks use StackAPI and require explicit recorded consent. KYC test mode is the default and cannot automatically approve applications. Live KYC is guarded by `STACKAPI_KYC_MODE=live` and `STACKAPI_KYC_LIVE_ENABLED=true`; enabling live checks can incur provider charges.
- Seller bank-account verification supports the configured Paystack or Nomba provider. Cloudinary, Resend, Firebase and Clerk integration code does not prove that the corresponding external account is correctly configured or that delivery has succeeded.

## Verification commands

```bash
npm run typecheck
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

The Jest unit suite is rooted under `src/`; end-to-end tests use `test/jest-e2e.json`. Run the relevant suites after changing behavior. These checks do not verify live provider credentials, delivery, deployment health or production database state.

For public route/schema changes, regenerate and inspect the OpenAPI contract:

```bash
npm run swagger:export
```

This command builds the application and writes the generated API contract under `docs/`. That local generated file is ignored by Git under the repository's documentation policy.

`npm run lint` applies fixes (`eslint --fix`); inspect the working tree after running it.

## Git and local documentation policy

- Only the root `README.md` is tracked as product/engineering documentation. The local `docs/` directory contains design references, planning material and generated documents and is intentionally ignored.
- Agent instructions and local agent setup folders (`.agents/`, `.claude/`, `.codex/`, and related files) are local-only and intentionally ignored.
- Keep `.env`, private keys, service-account JSON, database URLs, API credentials, tokens and customer data out of Git. `.env.example` may contain variable names and clearly fake placeholders only.
- Before staging, inspect `git status --short` and the staged file list. Preserve unrelated untracked work; do not add it as part of a README change.

## Repository map

| Path | Contents |
| --- | --- |
| `src/` | NestJS modules, controllers, DTOs, services, persistence adapters and unit tests. |
| `prisma/schema.prisma` | PostgreSQL data model. |
| `prisma/migrations/` | Versioned schema migrations. |
| `test/` | End-to-end test setup and suites. |
| `docker/` | Local development compose files. |
| `.env.example` | Environment variable names, safe examples and provider setup notes. |
| `README.md` | Tracked product and engineering overview, setup and verification guide. |

For exact behavior, start with the route's controller and DTO, follow it into the service/repository and Prisma model, then check the corresponding tests. The source is authoritative when older local notes disagree.
