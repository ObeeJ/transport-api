# Akin — Master Plan (Phased)

**Version:** 2.0
**Date locked:** 2026-08-25
**Owner:** ObeeJ

Every phase is a shippable slice with three synchronized layers: **DB schema → Backend (Go/Fiber) → Frontend (React PWA)**. Do not merge a phase unless all three layers exist and the phase's E2E test passes.

---

## Repo map (existing at v2.0 lock)

**Backend** — `internal/` packages:
`audit • config • db • email • handlers • identity • middleware • models • observability • payments • reconciler • repository • sanitize • service • ws`

- Entrypoint: `cmd/api/main.go` (Fiber route registration)
- Models: `internal/models/models.go` (GORM structs)
- Migrations: `internal/db/migrations/*.sql`

**Frontend** — `web/app/src/`:
- API client (single source of truth): `lib/api.ts`
- Auth context: `lib/auth.tsx`
- Toasts: `lib/toast.tsx`
- Existing routes: `AccountPage`, `ActiveTrip`, `DriverApply`, `DriverHome`, `EmailVerify`, `GiverHome`, `NotesFeed`, `NotificationsPage`, `Onboarding`, `PaystackCallback`, `PrivacyPromise`, `RecipientApply`, `RecipientBank`, `RecipientStatus`, `ResetConfirm`, `ResetRequest`, `RiderHome`, `RoleHome`, `RosterVerify`, `steward/`, `TransparencyReport`, `WalletPage`
- Gates: `components/RequireAuth.tsx`, `components/RequireSteward.tsx`
- Layout: `components/layout/`
- UI kit: `components/ui/`

**Sync rule:** every new endpoint gets a typed method in `lib/api.ts`. Every new response field extends the corresponding TS type. No route file may call `fetch()` directly.

---

# Phase 0 — Financial Spine (Week 1, non-negotiable)

**Goal:** every kobo movement is atomic, idempotent, auditable, reversible.

## 0.1 DB migrations

`internal/db/migrations/010_ledger_entries.sql`
```sql
CREATE TABLE ledger_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id        uuid NOT NULL,
  account_id    uuid NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('debit','credit')),
  amount_kobo   bigint NOT NULL CHECK (amount_kobo > 0),
  currency      text NOT NULL DEFAULT 'NGN',
  balance_after bigint NOT NULL,
  purpose       text NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_txn ON ledger_entries(txn_id);
CREATE INDEX idx_ledger_account_time ON ledger_entries(account_id, created_at DESC);
```

`internal/db/migrations/011_escrow_holds.sql`
```sql
CREATE TABLE escrow_holds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id             uuid NOT NULL UNIQUE,
  from_account_id    uuid NOT NULL,
  to_account_id      uuid NOT NULL,
  amount_kobo        bigint NOT NULL CHECK (amount_kobo > 0),
  currency           text NOT NULL DEFAULT 'NGN',
  purpose            text NOT NULL,
  reference_id       uuid,
  state              text NOT NULL CHECK (state IN
                       ('held','released','refunded','frozen','expired')),
  release_conditions jsonb NOT NULL DEFAULT '{}',
  expires_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            int NOT NULL DEFAULT 1
);
CREATE INDEX idx_escrow_state_expires ON escrow_holds(state, expires_at) WHERE state = 'held';
CREATE INDEX idx_escrow_reference ON escrow_holds(reference_id);
```

`internal/db/migrations/012_idempotency_keys.sql`
```sql
CREATE TABLE idempotency_keys (
  key           text PRIMARY KEY,
  user_id       uuid NOT NULL,
  endpoint      text NOT NULL,
  request_hash  text NOT NULL,
  response_code int,
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
```

`internal/db/migrations/013_outbox_events.sql`
```sql
CREATE TABLE outbox_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id   uuid NOT NULL,
  event_type     text NOT NULL,
  payload        jsonb NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','sent','failed','dead')),
  attempts       int NOT NULL DEFAULT 0,
  next_retry_at  timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz,
  last_error     text
);
CREATE INDEX idx_outbox_pending ON outbox_events(status, next_retry_at)
  WHERE status IN ('pending','failed');
```

## 0.2 Backend

**Create:**
- `internal/ledger/ledger.go` — `Write(tx, txnID, debit, credit Account, amountKobo int64, purpose string) error`
- `internal/ledger/types.go`
- `internal/ledger/ledger_test.go`
- `internal/escrow/escrow.go` — `Hold / Release / Refund / Freeze / Expire`
- `internal/escrow/state_machine.go`
- `internal/escrow/escrow_test.go`
- `internal/idempotency/middleware.go` — Fiber middleware reading `Idempotency-Key`
- `internal/idempotency/store.go`
- `internal/outbox/outbox.go` — `Emit(tx, eventType, payload)`
- `internal/outbox/dispatcher.go` — goroutine pool, exponential backoff

**Edit:**
- `internal/service/wallet.go` — wrap mutations: `db.Transaction` + `FOR UPDATE` + ledger + outbox
- `internal/service/deposit.go` — pending deposits via escrow
- `internal/service/payout.go` — Paystack transfer holds in escrow
- `internal/service/ride.go` — ride payment via escrow
- `internal/handlers/wallet.go` — attach idempotency middleware
- `internal/handlers/rides.go` — idempotency on `POST /trips/:id/bookings`
- `internal/handlers/payouts.go` — idempotency on `POST /wallet/withdraw`
- `internal/handlers/webhooks.go` — persist raw event to outbox, ack, process async
- `cmd/api/main.go` — start outbox dispatcher goroutines

## 0.3 Frontend

**Edit `web/app/src/lib/api.ts`:**
- Every money-mutating POST attaches `Idempotency-Key: crypto.randomUUID()`
- Types: `EscrowState = 'held'|'released'|'refunded'|'frozen'|'expired'`
- Error variants: `InsufficientFundsError`, `IdempotentReplay`

**Edit `web/app/src/routes/WalletPage.tsx`:** show pending escrow holds ("₦300 held for ride to Campus")

**Edit `web/app/src/routes/ActiveTrip.tsx`:** show escrow state pill (Held → In progress → Released)

## 0.4 API contract added

| Verb | Path | Purpose | Idempotent |
|---|---|---|---|
| GET | `/wallet/escrow` | List active holds | — |
| POST | `/wallet/debit` | Existing, now with `Idempotency-Key` | ✅ |
| POST | `/wallet/withdraw` | Existing, now escrowed | ✅ |
| POST | `/trips/:id/bookings` | Existing, now escrow + idempotency | ✅ |
| POST | `/webhooks/paystack` | Existing, now outbox-backed | (dedup by ref) |

## 0.5 Exit test

`internal/service/ledger_e2e_test.go`:
- 100 concurrent debits on same wallet — never negative, ledger sum = 0
- Same `Idempotency-Key` replayed → cached response
- Escrow `Hold → Release` credits destination exactly once
- Outbox event survives simulated Paystack timeout

---

# Phase 1 — Wings + Async KYC (Weeks 2–3)

**Goal:** ring-fenced credits (Wings) for recipients, NIN-verified identity, 7-day expiry returns idle Wings to pool.

## 1.1 DB migrations

`internal/db/migrations/020_wings_grants.sql`
```sql
CREATE TABLE wings_grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  amount       bigint NOT NULL,
  purpose      text NOT NULL,
  source_id    uuid,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','spent','expired','clawed_back','locked')),
  spent_at     timestamptz,
  locked_until timestamptz
);
CREATE INDEX idx_wings_user_active ON wings_grants(user_id, status);
CREATE INDEX idx_wings_expiry ON wings_grants(expires_at) WHERE status = 'active';
```

`internal/db/migrations/021_kyc.sql`
```sql
CREATE TABLE kyc_records (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE,
  nin_hash           text,
  nin_verified       boolean NOT NULL DEFAULT false,
  bvn_hash           text,
  bvn_verified       boolean NOT NULL DEFAULT false,
  selfie_match_score numeric,
  tier               int NOT NULL DEFAULT 0,
  provider           text DEFAULT 'prembly',
  raw_response       jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kyc_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  job_type     text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','done','failed')),
  attempts     int NOT NULL DEFAULT 0,
  result       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_kyc_jobs_queue ON kyc_jobs(status, created_at) WHERE status = 'queued';
```

## 1.2 Backend

**Create:**
- `internal/wings/wings.go` — `Issue / Spend / Lock / Unlock / Balance`
- `internal/wings/expiry_worker.go` — hourly cron, expired → pool via ledger
- `internal/wings/wings_test.go`
- `internal/kyc/prembly.go` — NIN/BVN client
- `internal/kyc/kyc_service.go` — `Submit(userID, ninEncrypted) (jobID, error)`
- `internal/kyc/tier.go`
- `internal/kyc/worker.go` — goroutine pool draining `kyc_jobs`
- `internal/handlers/wings.go` — `GET /wings/balance`, `GET /wings/history`
- `internal/handlers/kyc.go` — `POST /kyc/nin`, `GET /kyc/status/:jobId`

**Edit:**
- `internal/models/models.go` — add `KYCTier int`, `Anonymity string` to `User`
- `internal/service/recipient.go` — grants issue Wings, not cash
- `internal/service/ride.go` — booking spends Wings first, wallet second
- `internal/service/auth.go` — signup enqueues KYC job
- `internal/handlers/rides.go` — booking accepts `pay_with_wings: number`
- `cmd/api/main.go` — start expiry + KYC workers; register routes

## 1.3 Frontend

**Edit `web/app/src/lib/api.ts`:**
```ts
export type WingsBalance = { available: number; locked: number; expiring_soon: number };
export type KYCStatus = 'pending' | 'verified' | 'failed';

api.wings.balance()
api.wings.history()
api.kyc.submitNIN(nin, selfie)
api.kyc.status(jobId)
```

**Create:**
- `web/app/src/routes/KYCFlow.tsx` — NIN + selfie capture; polls status every 30s; tier badge on success
- `web/app/src/routes/WingsPage.tsx` — balance, upcoming expiries, history
- `web/app/src/components/ui/WingsBadge.tsx` — reusable `500W (~₦500)` chip

**Edit:**
- `web/app/src/routes/Onboarding.tsx` — trigger KYCFlow non-blocking
- `web/app/src/routes/RecipientStatus.tsx` — show Wings + expiry countdown
- `web/app/src/routes/ActiveTrip.tsx` — Wings-first payment split

## 1.4 API contract added

| Verb | Path | Purpose |
|---|---|---|
| POST | `/kyc/nin` | Enqueue NIN verification |
| GET | `/kyc/status/:jobId` | Poll job |
| GET | `/wings/balance` | Available/locked/expiring |
| GET | `/wings/history` | Grants + spends |
| POST | `/trips/:id/bookings` | Extended: `pay_with_wings` |

## 1.5 Exit test

`internal/service/wings_e2e_test.go`:
- Sponsor issues 500W → recipient sees 500 available
- Book 300W ride → 200 remain
- Expiry worker after 7d → residual 200W returns to pool
- NIN submitted → worker verifies → tier=1

---

# Phase 2 — Pricing + Evidence + Admin Dashboard (Week 4)

**Goal:** transparent physics-based fares, driver evidence in R2, single-Admin control panel replaces steward.

## 2.1 DB migrations

`internal/db/migrations/030_pricing.sql`
```sql
CREATE TABLE pricing_settings (
  id                int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fuel_price_naira  numeric NOT NULL DEFAULT 900,
  driver_margin_pct numeric NOT NULL DEFAULT 0.30,
  platform_fee_pct  numeric NOT NULL DEFAULT 0.03,
  platform_fee_min  bigint NOT NULL DEFAULT 1000,
  platform_fee_max  bigint NOT NULL DEFAULT 15000,
  surge_morning     numeric NOT NULL DEFAULT 1.2,
  surge_evening     numeric NOT NULL DEFAULT 1.3,
  updated_by        uuid,
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE vehicle_types (
  code          text PRIMARY KEY,
  display_name  text NOT NULL,
  km_per_litre  numeric NOT NULL,
  default_seats int NOT NULL,
  fuel_type     text NOT NULL DEFAULT 'petrol'
);

INSERT INTO vehicle_types VALUES
 ('keke','Keke',35,3,'petrol'),
 ('small_car','Small car',14,4,'petrol'),
 ('sedan','Sedan',11,4,'petrol'),
 ('big_suv','Big SUV',7,6,'petrol'),
 ('van','Van',9,8,'petrol'),
 ('hiace','Hiace bus',8,14,'petrol'),
 ('coaster','Coaster bus',6,25,'diesel');
```

`internal/db/migrations/031_evidence.sql`
```sql
CREATE TABLE evidence_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  kind          text NOT NULL,
  r2_key        text NOT NULL,
  r2_bucket     text NOT NULL,
  content_type  text,
  size_bytes    bigint,
  uploaded_at   timestamptz DEFAULT now(),
  reviewed_by   uuid,
  review_status text CHECK (review_status IN ('pending','approved','rejected')),
  review_notes  text
);
```

`internal/db/migrations/032_admin_actions.sql`
```sql
CREATE TABLE admin_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL,
  target_user uuid,
  target_ride uuid,
  action      text NOT NULL,
  reason      text NOT NULL,
  evidence    jsonb,
  created_at  timestamptz DEFAULT now()
);
```

## 2.2 Backend

**Create:**
- `internal/pricing/engine.go` — `Quote(origin, dest, vehicleCode, seats, at) (Quote, error)`
- `internal/pricing/vehicles.go` — cached lookup
- `internal/pricing/settings.go` — cached settings, invalidate on update
- `internal/storage/r2.go` — R2 client, presigned URLs
- `internal/admin/dashboard.go` — metrics aggregation
- `internal/admin/settings.go` — pricing CRUD
- `internal/admin/report_queue.go`
- `internal/handlers/admin.go`
- `internal/handlers/evidence.go`

**Edit:**
- `internal/handlers/driver.go` — apply requires evidence IDs
- `internal/handlers/rides.go` — publish/quote endpoints call `pricing.Quote`
- `internal/handlers/steward.go` — rename semantics to admin; gate to `RoleAdmin`
- `internal/models/models.go` — mark `RoleSteward` deprecated; new code uses `RoleAdmin`
- `cmd/api/main.go` — register `/admin/*`, `/evidence/*`, gate to admin

## 2.3 Frontend

**Edit `web/app/src/lib/api.ts`:**
```ts
api.pricing.quote(params)
api.evidence.uploadUrl(kind)
api.evidence.list()
api.admin.metrics()
api.admin.updatePricing(patch)
api.admin.reviewDriver(userId, decision, notes?)
api.admin.reviewEvidence(id, decision, notes?)
```

**Create:**
- `web/app/src/routes/admin/AdminDashboard.tsx` — Grafana-style layout
- `web/app/src/routes/admin/PricingSettings.tsx` — sliders + live preview
- `web/app/src/routes/admin/DriverQueue.tsx` — evidence review cards
- `web/app/src/routes/admin/ReportQueue.tsx` — action buttons
- `web/app/src/components/RequireAdmin.tsx` — replaces `RequireSteward.tsx`

**Edit:**
- `web/app/src/routes/DriverApply.tsx` — evidence upload via presigned R2 URLs (selfie video, vehicle photos, license, walkaround)
- `web/app/src/routes/RiderHome.tsx` — booking shows live fare quote

## 2.4 API contract added

| Verb | Path | Purpose |
|---|---|---|
| POST | `/pricing/quote` | Physics-based fare |
| POST | `/evidence/upload-url` | Presigned R2 URL |
| POST | `/evidence/:id/review` | Admin decision |
| GET | `/admin/metrics` | Dashboard aggregates |
| PATCH | `/admin/pricing` | Update knobs |
| GET | `/admin/reports` | Report queue |
| POST | `/admin/reports/:id/action` | Decision |
| POST | `/admin/drivers/:userId/review` | Approve/reject |

## 2.5 Exit test

`internal/pricing/engine_test.go` — golden fares per vehicle at fixed fuel price.
`internal/service/admin_e2e_test.go` — driver applies with evidence → admin approves → tier↑ → can offer trips.

---

# Phase 3 — Trust Engine + Matcher + Guaranteed-Ride Ladder (Week 5)

**Goal:** system autonomously handles ≥90% of decisions; no rider left hanging.

## 3.1 DB migrations

`internal/db/migrations/040_trust.sql`
```sql
CREATE TABLE trust_scores (
  user_id       uuid PRIMARY KEY,
  score         int NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  tier          text NOT NULL DEFAULT 'new',
  components    jsonb NOT NULL DEFAULT '{}',
  recomputed_at timestamptz DEFAULT now()
);
```

`internal/db/migrations/041_matcher.sql`
```sql
CREATE TABLE partner_drivers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  phone_e164      text NOT NULL,
  whatsapp_opt_in boolean DEFAULT true,
  vehicle_type    text,
  home_base_lat   numeric,
  home_base_lng   numeric,
  status          text DEFAULT 'active',
  rating          numeric DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE ride_offers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    uuid NOT NULL,
  driver_id  uuid,
  partner_id uuid,
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','accepted','declined','expired'))
);
```

## 3.2 Backend

**Create:**
- `internal/trust/engine.go` — recompute on event; `Score(userID)`
- `internal/trust/rules.go` — auto-approve/strike/freeze thresholds
- `internal/trust/worker.go` — subscribes to outbox events
- `internal/matcher/matcher.go` — goroutine pool, ranks drivers
- `internal/matcher/scorer.go`
- `internal/matcher/geo_index.go` — Redis GEO
- `internal/matcher/ladder.go` — Peer → Partner → Emergency Grant
- `internal/partners/partners.go`
- `internal/partners/whatsapp.go` — Cloud API

**Edit:**
- `internal/service/payout.go` — auto-approve when `trust >= 70 AND amount < ₦5k`
- `internal/service/appeal.go` — auto-review from evidence + trust
- `internal/handlers/rides.go` — request enqueues to matcher; status shows ladder tier
- `internal/handlers/admin.go` — trust escalation queue
- `cmd/api/main.go` — start Trust Engine + matcher + ladder workers

## 3.3 Frontend

**Edit `web/app/src/lib/api.ts`:**
```ts
api.trust.me()
api.rides.request(params)
api.rides.status(id)
```

**Create:**
- `web/app/src/routes/RideSearching.tsx` — live "Searching within 10km…"; WS updates
- `web/app/src/routes/EmergencyGrantScan.tsx` — QR two-way handshake

**Edit:**
- `web/app/src/routes/RiderHome.tsx` — after booking, redirect to `RideSearching`
- `web/app/src/routes/AccountPage.tsx` — trust score + tier + breakdown
- `web/app/src/routes/admin/DriverQueue.tsx` — add trust column

## 3.4 API contract added

| Verb | Path | Purpose |
|---|---|---|
| GET | `/trust/me` | User trust + breakdown |
| POST | `/rides/request` | Matcher takes over |
| GET | `/rides/:id/status` | Ladder progress |
| POST | `/rides/:id/emergency-scan` | Partner QR handshake |
| GET | `/admin/trust-queue` | Human escalations |

## 3.5 Exit test

`internal/matcher/ladder_test.go` — no peer in 5min → tier 2; no partner in 15min → tier 3 with admin nod.

---

# Phase 4 — Social Feed + Transparency Wall + Streaks (Weeks 6–7)

**Goal:** every sponsored gift publicly acknowledged before spend; feed drives engagement; streaks create habit.

## 4.1 DB migrations

`internal/db/migrations/050_social.sql`
```sql
CREATE TABLE posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid NOT NULL,
  kind       text NOT NULL,
  body       text NOT NULL,
  media_keys text[],
  refs       jsonb DEFAULT '{}',
  circle_id  uuid,
  visibility text NOT NULL DEFAULT 'public'
             CHECK (visibility IN ('public','circle','followers','private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  score      numeric DEFAULT 0,
  hidden     boolean DEFAULT false
);
CREATE INDEX idx_posts_recent ON posts(created_at DESC) WHERE NOT hidden;
CREATE INDEX idx_posts_circle ON posts(circle_id, created_at DESC);

CREATE TABLE follows (
  follower_id uuid NOT NULL,
  followee_id uuid NOT NULL,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);

CREATE TABLE post_claps (
  post_id    uuid NOT NULL,
  user_id    uuid NOT NULL,
  count      int NOT NULL DEFAULT 1 CHECK (count BETWEEN 1 AND 50),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE reshares (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL,
  user_id    uuid NOT NULL,
  quote_text text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE streaks (
  user_id      uuid NOT NULL,
  kind         text NOT NULL,
  count        int NOT NULL DEFAULT 0,
  last_hit_at  timestamptz,
  freezes_left int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE transparency_holds (
  user_id      uuid PRIMARY KEY,
  wings_locked bigint NOT NULL DEFAULT 0,
  reason       text NOT NULL,
  locked_at    timestamptz DEFAULT now(),
  release_by   timestamptz NOT NULL
);
```

## 4.2 Backend

**Create:**
- `internal/social/posts.go` — `Create / Get / Delete / Score`
- `internal/social/follow.go`
- `internal/social/claps.go`
- `internal/social/reshares.go`
- `internal/social/streaks.go` — increment on qualifying events, decay
- `internal/social/feed_algo.go` — candidate sourcing + ranking + diversity
- `internal/transparency/wall.go` — on `wings.Issue` set `locked_until`; on `posts.Create` matching sponsor → unlock
- `internal/handlers/social.go` — `/posts`, `/follows`, `/claps`, `/reshares`, `/feed`, `/streaks/me`

**Edit:**
- `internal/wings/wings.go` — status='locked' when transparency wall applies
- `internal/service/notification.go` — add template pool (engine comes in Phase 5)
- `cmd/api/main.go` — register `/posts/*`, `/follows/*`, `/feed`, `/streaks/*`

## 4.3 Frontend

**Edit `web/app/src/lib/api.ts`:**
```ts
api.posts.create(input)
api.posts.list(tab: 'foryou'|'following'|'circle'|'nearby'|'live')
api.posts.clap(id, count)
api.posts.reshare(id, quote?)
api.follows.toggle(userId)
api.streaks.me()
api.transparency.myHolds()
```

**Create:**
- `web/app/src/routes/FeedHome.tsx` — swipeable tabs (framer-motion + useSwipeable)
- `web/app/src/routes/PostComposer.tsx` — post-before-spend modal; auto-fills "Thank you @sponsor…"
- `web/app/src/routes/ProfilePage.tsx` — claps, follows, streaks, badges
- `web/app/src/components/ui/ClapButton.tsx` — repeat-tap up to 50
- `web/app/src/components/ui/StreakChip.tsx` — 🔥 + freeze warning
- `web/app/src/components/ui/TransparencyBanner.tsx` — "Post to unlock 500W"

**Edit:**
- `web/app/src/components/layout/` — authenticated home = `FeedHome`
- `web/app/src/routes/WingsPage.tsx` — show locked amount + CTA
- `web/app/src/routes/RecipientStatus.tsx` — prompt composer when Wings issued

## 4.4 API contract added

| Verb | Path | Purpose |
|---|---|---|
| POST | `/posts` | Create (unlocks Wings if sponsor tagged) |
| GET | `/feed?tab=` | Ranked feed |
| POST | `/posts/:id/clap` | 1–50 |
| POST | `/posts/:id/reshare` | With optional quote |
| POST | `/follows/:userId` | Toggle |
| GET | `/streaks/me` | All + freezes |
| GET | `/transparency/holds` | Active locks |

## 4.5 Exit test

`internal/service/transparency_e2e_test.go` — sponsor → recipient Wings locked → recipient posts → Wings unlock → book ride.

---

# Phase 5 — Ambassadors + Sponsors + Auto-Debit + Copy Engine (Week 8)

**Goal:** self-funding growth loop; emotional notifications; recurring giving.

## 5.1 DB migrations

`internal/db/migrations/060_ambassadors.sql`
```sql
CREATE TABLE ambassadors (
  user_id       uuid PRIMARY KEY,
  activated_at  timestamptz DEFAULT now(),
  tier          text NOT NULL DEFAULT 'bronze',
  referral_code text UNIQUE NOT NULL,
  earned_wings  bigint NOT NULL DEFAULT 0,
  earned_naira  bigint NOT NULL DEFAULT 0,
  vanity_url    text UNIQUE
);

CREATE TABLE ambassador_referrals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id uuid NOT NULL,
  referred_id   uuid NOT NULL UNIQUE,
  reward_status text NOT NULL DEFAULT 'pending',
  paid_txn_id   uuid,
  created_at    timestamptz DEFAULT now(),
  resolved_at   timestamptz
);
```

`internal/db/migrations/061_recurring_sponsors.sql`
```sql
CREATE TABLE recurring_sponsors (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL,
  amount_kobo           bigint NOT NULL,
  cadence               text NOT NULL,
  paystack_auth_code    text NOT NULL,
  status                text NOT NULL DEFAULT 'active',
  next_charge_at        timestamptz NOT NULL,
  last_charge_at        timestamptz,
  last_charge_status    text,
  consecutive_failures  int NOT NULL DEFAULT 0,
  paused_until          timestamptz,
  created_at            timestamptz DEFAULT now()
);
```

## 5.2 Backend

**Create:**
- `internal/ambassador/ambassador.go` — activate, benefits, reward flow
- `internal/ambassador/referral_reward.go` — first-paid-txn → release from escrow
- `internal/sponsor/recurring.go` — daily cron: due charges → Paystack → issue Wings
- `internal/notification/copy_engine.go` — hooks + templates + CTAs
- `internal/notification/templates/*.txt` — 15+ per event
- `internal/handlers/ambassador.go`
- `internal/handlers/sponsor.go`

**Edit:**
- `internal/service/notification.go` — route all sends through `copy_engine`
- `internal/service/auth.go` — auto-provision inactive `ambassadors` row; password on role switch
- `cmd/api/main.go` — start recurring cron; register `/ambassador/*`, `/sponsor/*`

## 5.3 Frontend

**Edit `web/app/src/lib/api.ts`:**
```ts
api.ambassador.activate()
api.ambassador.me()
api.sponsor.setupRecurring(input)
api.sponsor.cancel(id)
api.sponsor.retryNow(id)
api.roleSwitch(newRole, password)
```

**Create:**
- `web/app/src/routes/AmbassadorDashboard.tsx` — earnings, referrals, benefits
- `web/app/src/routes/SponsorSetup.tsx` — amount + cadence + rewards
- `web/app/src/routes/RoleSwitchModal.tsx` — password re-entry

**Edit:**
- `web/app/src/routes/GiverHome.tsx` — "Set up weekly giving" CTA
- `web/app/src/routes/AccountPage.tsx` — role switcher opens modal
- `web/app/src/routes/Onboarding.tsx` — explicit anonymity choice

## 5.4 API contract added

| Verb | Path | Purpose |
|---|---|---|
| POST | `/ambassador/activate` | Activate row |
| GET | `/ambassador/me` | Dashboard |
| POST | `/sponsor/recurring` | Set up auto-debit |
| DELETE | `/sponsor/recurring/:id` | Cancel |
| POST | `/sponsor/recurring/:id/retry` | Manual retry |
| POST | `/auth/role-switch` | Password-gated |

## 5.5 Exit test

`internal/service/ambassador_e2e_test.go` — referral signs up → first ride → reward pending → earned → Wings credited.

---

# Phase 6 — Circle Membership + Verified Ticks + Ads (Week 9)

**Goal:** subscription revenue, verified badges, non-intrusive ads for non-members.

## 6.1 DB migrations

`internal/db/migrations/070_circle_membership.sql`
```sql
CREATE TABLE circle_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE,
  purchased_at    timestamptz NOT NULL DEFAULT now(),
  price_kobo      bigint NOT NULL,
  status          text NOT NULL DEFAULT 'active',
  founding_member boolean DEFAULT false
);
```

`internal/db/migrations/071_ads.sql`
```sql
CREATE TABLE ads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL,
  creative_key  text NOT NULL,
  cta_url       text NOT NULL,
  budget_kobo   bigint NOT NULL,
  spent_kobo    bigint NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'pending',
  target        jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE ad_impressions (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id   uuid NOT NULL,
  user_id uuid NOT NULL,
  at      timestamptz DEFAULT now()
);
```

## 6.2 Backend

**Create:**
- `internal/circle/circle.go` — purchase, cancel, first-500 free-forever grant
- `internal/circle/badges.go` — grey/blue/gold/diamond resolution
- `internal/ads/ads.go` — CRUD + budget accounting
- `internal/ads/targeting.go` — skip if Circle member
- `internal/handlers/circle.go`
- `internal/handlers/ads.go`

**Edit:**
- `internal/social/feed_algo.go` — inject max 1 ad per 8 posts for non-members
- `cmd/api/main.go` — register `/circle/*`, `/ads/*`

## 6.3 Frontend

**Edit `web/app/src/lib/api.ts`:**
```ts
api.circle.status()
api.circle.purchase()
api.ads.mine()
api.ads.create(input)
```

**Create:**
- `web/app/src/routes/CirclePurchase.tsx` — pitch + Paystack checkout
- `web/app/src/routes/AdvertiserPortal.tsx` — self-serve ads
- `web/app/src/components/ui/VerifiedTick.tsx` — grey/blue/gold/diamond
- `web/app/src/components/ui/AdCard.tsx` — sponsored slot

**Edit:**
- `web/app/src/routes/FeedHome.tsx` — render `AdCard` in slots
- `web/app/src/routes/ProfilePage.tsx` — verified tick next to name
- All name renders across `NotesFeed`, `RiderHome`, `DriverHome`, `WalletPage` — shared `<UserName />` component

## 6.4 API contract added

| Verb | Path | Purpose |
|---|---|---|
| GET | `/circle/status` | Membership + badge |
| POST | `/circle/purchase` | Paystack checkout |
| POST | `/circle/webhook` | Paystack callback |
| GET | `/ads/mine` | Advertiser's ads |
| POST | `/ads` | Create ad |
| GET | `/feed?tab=` | Interleaved ads for non-members |

## 6.5 Exit test

`internal/service/circle_e2e_test.go` — non-member sees ads → purchases → ads disappear next feed load.

---

# Phase 7 — Multi-Tenant Circles + Whitelabel (Week 10)

**Goal:** cross-sector expansion — one platform, many communities.

## 7.1 DB migrations

`internal/db/migrations/080_institutions.sql`
```sql
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS admin_user_id uuid;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS logo_r2_key text;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#000';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS fund_rules jsonb DEFAULT '{}';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS invite_link_token text UNIQUE;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS sector text;
```

## 7.2 Backend

**Create:**
- `internal/institution/institution.go` — create, invite, set admin
- `internal/institution/branding.go`
- `internal/handlers/institution.go` — `/circles/*`

**Edit:**
- Every service — ensure `institution_id` scope
- `internal/middleware/*` — inject current institution
- Feed queries — default to user's institution with opt-in cross-Circle

## 7.3 Frontend

**Edit `web/app/src/lib/api.ts`:**
```ts
api.circles.create(input)
api.circles.join(token)
api.circles.mine()
api.circles.switch(id)
```

**Create:**
- `web/app/src/routes/CircleCreate.tsx` — community leaders onboard
- `web/app/src/routes/CircleJoin.tsx` — invite-link landing
- `web/app/src/components/CircleSwitcher.tsx` — top-bar dropdown

**Edit:**
- All content pages — respect active Circle context

## 7.4 API contract added

| Verb | Path | Purpose |
|---|---|---|
| POST | `/circles` | Create (whitelabel) |
| POST | `/circles/join/:token` | Join via invite |
| GET | `/circles/mine` | User's Circles |
| POST | `/circles/:id/switch` | Set active context |

## 7.5 Exit test

`internal/service/multitenant_e2e_test.go` — two Circles, cross-visibility only when opted in, admin of A cannot see B's fund pool.

---

# Cross-cutting sync rules (enforced every phase)

1. **API contract single source of truth:** `web/app/src/lib/api.ts` — each phase adds a titled section.
2. **DB → Model → API → Frontend type flow:** new SQL column → GORM field → JSON in handler → TS field.
3. **Every mutation needs:** `Idempotency-Key` header + `db.Transaction` + ledger write + outbox emit.
4. **Every list endpoint needs:** `limit`, `cursor`, returns `{ items, next_cursor }`.
5. **Every user-visible error:** toast via `lib/toast.tsx` with actionable copy — no raw HTTP codes.
6. **Every Admin route:** gated by `RequireAdmin.tsx`, backend `RoleAdmin` middleware, audit-log entry.
7. **Every new event type:** documented in `internal/outbox/events.md` with exact payload shape.

---

# Non-negotiables (locked)

1. Safety features (SOS, Report, Recipient help) always free.
2. Money never enters a user's cash wallet from the fund. Wings only.
3. Every money movement uses double-entry + row locks + idempotency + escrow + outbox.
4. Every user is NIN-verified.
5. Transparency wall is a hard gate. No post = no spend.
6. Core is free forever. Monetization on the edges.
7. Circle members never see ads.
8. Beta users (first 500) get free Akin Circle for life + zero fees for 12 months.
9. Wings expire after 7 days.
10. Role switching requires password re-entry, always audit-logged.
11. Admin is one person. Trust Engine handles ≥90% of decisions.
12. Every notification is emotional copy. Never "Error 500".
13. Cross-sector from day one.
14. No mocks in E2E tests. Real DB, real endpoints.
15. Pricing physics-based and transparent.

---

# Ticket order (execute top-down)

| # | Phase | Ticket | Est. |
|---|---|---|---|
| 1 | 0 | Financial spine | 5–7d |
| 2 | 1 | Wings + expiry worker | 2–3d |
| 3 | 1 | Prembly NIN async + polling | 2d |
| 4 | 2 | R2 evidence + admin queue | 2d |
| 5 | 2 | Physics pricing + admin sliders | 2d |
| 6 | 3 | Matcher + WhatsApp partners + ladder | 4d |
| 7 | 3 | Trust Engine (deletes steward) | 3d |
| 8 | 4 | Feed + transparency wall + composer | 4d |
| 9 | 4 | Claps + reshares + streaks | 2d |
| 10 | 5 | Ambassador + referral funding | 2d |
| 11 | 5 | Sponsor auto-debit + copy engine | 3d |
| 12 | 6 | Circle membership + verified ticks | 2d |
| 13 | 6 | Ads system | 3d |
| 14 | 7 | Multi-tenant Circles polish | 3d |
| 15 | all | Full E2E test suite | 3d |

**Total: ~7–8 weeks solo, ~3–4 weeks paired.**

---

**End of Master Plan v2.0.**
