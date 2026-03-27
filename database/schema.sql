-- =====================================================
-- BIDVIBE DATABASE SCHEMA
-- =====================================================

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  nickname          TEXT,
  avatar_url        TEXT,
  phone             TEXT,
  address           TEXT,
  reputation_score  DECIMAL(3,2) NOT NULL DEFAULT 5.0,
  role              TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
  is_banned         BOOLEAN NOT NULL DEFAULT false,
  is_muted          BOOLEAN NOT NULL DEFAULT false,
  banned_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. WALLETS
CREATE TABLE IF NOT EXISTS wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_available DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (balance_available >= 0),
  balance_locked    DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (balance_locked >= 0),
  version           BIGINT NOT NULL DEFAULT 0
);

-- 3. ITEMS
CREATE TABLE IF NOT EXISTS items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id        UUID NOT NULL REFERENCES users(id),
  current_owner_id UUID NOT NULL REFERENCES users(id),
  name             TEXT NOT NULL,
  description      TEXT,
  image_urls       JSONB NOT NULL DEFAULT '[]',
  tags             JSONB NOT NULL DEFAULT '[]',
  rarity           TEXT NOT NULL DEFAULT 'COMMON' CHECK (rarity IN ('COMMON','RARE','LEGENDARY')),
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','IN_AUCTION','IN_INVENTORY','SHIPPED','REJECTED')),
  cooldown_until   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. AUCTION_SESSIONS
CREATE TABLE IF NOT EXISTS auction_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('ENGLISH','DUTCH','SEALED')),
  start_time        TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  remaining_seconds INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. AUCTIONS
CREATE TABLE IF NOT EXISTS auctions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES auction_sessions(id),
  item_id             UUID NOT NULL REFERENCES items(id),
  start_price         DECIMAL(18,2) NOT NULL,
  current_price       DECIMAL(18,2) NOT NULL,
  step_price          DECIMAL(18,2) NOT NULL DEFAULT 0,
  winner_id           UUID REFERENCES users(id),
  status              TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING','ACTIVE','ENDED','CANCELLED')),
  duration_seconds    INTEGER NOT NULL DEFAULT 120,
  extend_seconds      INTEGER NOT NULL DEFAULT 30,
  end_time            TIMESTAMPTZ,
  order_index         INTEGER NOT NULL DEFAULT 0,
  decrease_amount     DECIMAL(18,2),
  interval_seconds    INTEGER,
  min_price           DECIMAL(18,2),
  last_price_drop_at  TIMESTAMPTZ,
  version             BIGINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. BIDS
CREATE TABLE IF NOT EXISTS bids (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id  UUID NOT NULL REFERENCES auctions(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  amount      DECIMAL(18,2) NOT NULL,
  bid_time    TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_proxy    BOOLEAN NOT NULL DEFAULT false
);

-- 7. PROXY_BIDS
CREATE TABLE IF NOT EXISTS proxy_bids (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id  UUID NOT NULL REFERENCES auctions(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  max_amount  DECIMAL(18,2) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (auction_id, user_id)
);

-- 8. MARKET_LISTINGS
CREATE TABLE IF NOT EXISTS market_listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES items(id),
  seller_id     UUID NOT NULL REFERENCES users(id),
  asking_price  DECIMAL(18,2) NOT NULL,
  buyer_id      UUID REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SOLD','CANCELLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. WATCHLISTS
CREATE TABLE IF NOT EXISTS watchlists (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id   UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, item_id)
);

-- 10. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('OUTBID','AUCTION_WON','WATCHLIST_ALERT','FINANCE','MODERATION','ITEM_REJECTED')),
  title       TEXT NOT NULL,
  content     TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id          UUID NOT NULL REFERENCES users(id),
  receiver_id        UUID REFERENCES users(id),
  auction_id         UUID REFERENCES auctions(id),
  market_listing_id  UUID REFERENCES market_listings(id),
  content            TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     UUID NOT NULL REFERENCES wallets(id),
  type          TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAW','BID_LOCK','BID_UNLOCK','FINAL_PAYMENT','PLATFORM_FEE')),
  amount        DECIMAL(18,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED','CANCELLED')),
  reference_id  UUID,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. RATINGS
CREATE TABLE IF NOT EXISTS ratings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id       UUID NOT NULL REFERENCES users(id),
  to_user_id         UUID NOT NULL REFERENCES users(id),
  auction_id         UUID REFERENCES auctions(id),
  market_listing_id  UUID REFERENCES market_listings(id),
  stars              INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_user_id, auction_id),
  UNIQUE (from_user_id, market_listing_id)
);

-- =====================================================
-- INDEXES - Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_bids_auction_amount
  ON bids (auction_id, amount DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bids_auction_user_sealed
  ON bids (auction_id, user_id);

CREATE INDEX IF NOT EXISTS idx_auctions_session
  ON auctions (session_id, order_index);

CREATE INDEX IF NOT EXISTS idx_auctions_active
  ON auctions (status) WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_auctions_item_active
  ON auctions (item_id) WHERE status IN ('WAITING','ACTIVE');

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_listings_item_active
  ON market_listings (item_id) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_market_listings_seller
  ON market_listings (seller_id, status);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet
  ON transactions (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_pending
  ON transactions (status, type) WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_messages_auction
  ON messages (auction_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_listing
  ON messages (market_listing_id, created_at);

CREATE INDEX IF NOT EXISTS idx_watchlists_item
  ON watchlists (item_id);

CREATE INDEX IF NOT EXISTS idx_items_status
  ON items (status);

CREATE INDEX IF NOT EXISTS idx_proxy_bids_auction_active
  ON proxy_bids (auction_id, is_active) WHERE is_active = true;