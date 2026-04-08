const { query } = require("../config/database.config");
const { pageResponse, parsePagination } = require("../utils/pagination");

const ensureShippingRequestsTable = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS shipping_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shipping_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RECEIVED')),
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_shipping_requests_item ON shipping_requests (item_id, created_at DESC)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_shipping_requests_status ON shipping_requests (status, created_at DESC)`,
  );
};

const normalizeItem = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrls: row.image_urls || [],
    tags: row.tags || [],
    rarity: row.rarity,
    status: row.status,
    cooldownUntil: row.cooldown_until,
    createdAt: row.created_at,

    seller: row.seller_id
      ? {
          id: row.seller_id,
          nickname: row.seller_nickname,
          avatarUrl: row.seller_avatar_url,
          reputationScore: parseFloat(row.seller_reputation_score) || 5.0,
        }
      : null,

    currentOwner:
      row.owner_id || row.current_owner_id
        ? {
            id: row.owner_id || row.current_owner_id,
            nickname: row.owner_nickname,
            avatarUrl: row.owner_avatar_url,
            reputationScore: parseFloat(row.owner_reputation_score) || 5.0,
          }
        : null,
    shippingRequest: row.shipping_request_id
      ? {
          id: row.shipping_request_id,
          status: row.shipping_request_status,
          shippingAddress: row.shipping_request_address,
          adminNote: row.shipping_request_admin_note,
          createdAt: row.shipping_request_created_at,
          updatedAt: row.shipping_request_updated_at,
        }
      : null,
  };
};

const create = async ({
  name,
  description,
  imageUrls,
  tags,
  rarity,
  sellerId,
  currentOwnerId,
  status,
}) => {
  const { rows } = await query(
    `INSERT INTO items
       (id, seller_id, current_owner_id, name, description, image_urls, tags, rarity, status, created_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now())
     RETURNING *`,
    [
      sellerId,
      currentOwnerId,
      name,
      description,
      JSON.stringify(imageUrls || []),
      JSON.stringify(tags || []),
      rarity || "COMMON",
      status,
    ],
  );
  return normalizeItem(rows[0]);
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT i.*,
            s.id AS seller_id,
            s.nickname AS seller_nickname,
            s.avatar_url AS seller_avatar_url,
            s.reputation_score AS seller_reputation_score,
            o.id AS owner_id,
            o.nickname AS owner_nickname,
            o.avatar_url AS owner_avatar_url,
            o.reputation_score AS owner_reputation_score,
            la.id AS latest_auction_id,
            la.final_price AS latest_auction_final_price,
            la.ended_at AS latest_auction_ended_at,
            ml.id AS active_listing_id,
            ml.asking_price AS active_listing_asking_price,
            ml.created_at AS active_listing_created_at
     FROM items i
     JOIN users s ON s.id = i.seller_id
     LEFT JOIN users o ON o.id = i.current_owner_id
     LEFT JOIN LATERAL (
       SELECT a.id,
              a.current_price AS final_price,
              a.end_time AS ended_at
       FROM auctions a
       WHERE a.item_id = i.id AND a.status = 'ENDED'
       ORDER BY a.end_time DESC NULLS LAST
       LIMIT 1
     ) la ON true
     LEFT JOIN LATERAL (
       SELECT l.id,
              l.asking_price,
              l.created_at
       FROM market_listings l
       WHERE l.item_id = i.id AND l.status = 'ACTIVE'
       ORDER BY l.created_at DESC
       LIMIT 1
     ) ml ON true
     WHERE i.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrls: row.image_urls,
    tags: row.tags,
    rarity: row.rarity,
    status: row.status,
    cooldownUntil: row.cooldown_until,
    createdAt: row.created_at,
    seller: {
      id: row.seller_id,
      nickname: row.seller_nickname,
      avatarUrl: row.seller_avatar_url,
      reputationScore: row.seller_reputation_score,
    },
    currentOwner: row.owner_id
      ? {
          id: row.owner_id,
          nickname: row.owner_nickname,
          avatarUrl: row.owner_avatar_url,
          reputationScore: row.owner_reputation_score,
        }
      : null,
    latestAuction: row.latest_auction_id
      ? {
          id: row.latest_auction_id,
          finalPrice: parseFloat(row.latest_auction_final_price),
          endedAt: row.latest_auction_ended_at,
        }
      : null,
    activeListing: row.active_listing_id
      ? {
          id: row.active_listing_id,
          askingPrice: parseFloat(row.active_listing_asking_price),
          createdAt: row.active_listing_created_at,
        }
      : null,
  };
};

const findByOwner = async (userId, q) => {
  await ensureShippingRequestsTable();
  const { page, size } = parsePagination(q);
  const { rows } = await query(
    `SELECT i.*,
            s.id AS seller_id,
            s.nickname AS seller_nickname,
            s.avatar_url AS seller_avatar_url,
            s.reputation_score AS seller_reputation_score,
            o.id AS owner_id,
            o.nickname AS owner_nickname,
            o.avatar_url AS owner_avatar_url,
            o.reputation_score AS owner_reputation_score,
            sr.id AS shipping_request_id,
            sr.status AS shipping_request_status,
            sr.shipping_address AS shipping_request_address,
            sr.admin_note AS shipping_request_admin_note,
            sr.created_at AS shipping_request_created_at,
            sr.updated_at AS shipping_request_updated_at
     FROM items i
     JOIN users s ON s.id = i.seller_id
     JOIN users o ON o.id = i.current_owner_id
     LEFT JOIN LATERAL (
       SELECT id, status, shipping_address, admin_note, created_at, updated_at
       FROM shipping_requests
       WHERE item_id = i.id AND requester_id = $1
       ORDER BY created_at DESC
       LIMIT 1
     ) sr ON true
     WHERE i.current_owner_id = $1
     ORDER BY i.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, size, page * size],
  );

  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM items WHERE current_owner_id = $1`,
    [userId],
  );

  return pageResponse(rows.map(normalizeItem), cnt[0].count, page, size);
};

const updateStatus = async (id, status) => {
  const { rows } = await query(
    "UPDATE items SET status = $2 WHERE id = $1 RETURNING *",
    [id, status],
  );
  return normalizeItem(rows[0]);
};

const update = async (id, fields) => {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const { rows } = await query(
    `UPDATE items SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...Object.values(fields)],
  );
  return normalizeItem(rows[0]);
};

const remove = async (id) => {
  const { rows } = await query("DELETE FROM items WHERE id = $1 RETURNING *", [
    id,
  ]);
  return normalizeItem(rows[0]);
};

const isInCooldown = async (id) => {
  const { rows } = await query(
    `SELECT EXISTS(
      SELECT 1 FROM items
      WHERE id = $1 AND cooldown_until > now()
    ) AS in_cooldown`,
    [id],
  );
  return rows[0]?.in_cooldown;
};

const findLatestShippingRequest = async (itemId) => {
  await ensureShippingRequestsTable();
  const { rows } = await query(
    `SELECT * FROM shipping_requests
     WHERE item_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [itemId],
  );
  return rows[0] || null;
};

const createShippingRequest = async ({
  itemId,
  requesterId,
  shippingAddress,
}) => {
  await ensureShippingRequestsTable();
  const { rows } = await query(
    `INSERT INTO shipping_requests
       (id, item_id, requester_id, shipping_address, status, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, 'PENDING', now(), now())
     RETURNING *`,
    [itemId, requesterId, shippingAddress],
  );
  return rows[0];
};

const updateShippingRequest = async (id, fields = {}) => {
  await ensureShippingRequestsTable();
  const keys = Object.keys(fields);
  if (keys.length === 0) return null;

  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const { rows } = await query(
    `UPDATE shipping_requests
     SET ${sets}, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, ...Object.values(fields)],
  );
  return rows[0] || null;
};

module.exports = {
  create,
  findById,
  findByOwner,
  updateStatus,
  update,
  remove,
  isInCooldown,
  findLatestShippingRequest,
  createShippingRequest,
  updateShippingRequest,
  ensureShippingRequestsTable,
};
