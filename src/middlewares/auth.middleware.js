require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { query } = require('../config/database.config');
const { error } = require('../utils/apiResponse');
const { ErrorCode } = require('../constants/errorCodes');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return error(res, 'Missing or invalid Authorization header', ErrorCode.UNAUTHORIZED, 401);
  }

  const token = authHeader.slice(7);
  try {
    const { data, error: authError } = await supabase.auth.getUser(token);

    if (authError || !data?.user) {
      return error(res, 'Token không hợp lệ hoặc đã hết hạn.', ErrorCode.UNAUTHORIZED, 401);
    }

    const decoded = {
      sub: data.user.id,
      email: data.user.email,
    };

    // Auto create user + wallet nếu lần đầu login
    const { rows } = await query(
      `INSERT INTO users (id, email, nickname, reputation_score, role, is_banned, is_muted, created_at)
       VALUES ($1, $2, $2, 5.0, 'USER', false, false, now())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email, nickname, role, is_banned, is_muted`,
      [decoded.sub, decoded.email]
    );
    const user = rows[0];

    await query(
      `INSERT INTO wallets (id, user_id, balance_available, balance_locked, version)
       VALUES (gen_random_uuid(), $1, 0, 0, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );

    if (user.is_banned) {
      return error(res, 'Tài khoản của bạn đã bị khóa.', ErrorCode.USER_BANNED, 403);
    }

    req.user = user;
    next();
  } catch (err) {
    return error(res, 'Token không hợp lệ hoặc đã hết hạn.', ErrorCode.UNAUTHORIZED, 401);
  }
};

module.exports = { authenticate };