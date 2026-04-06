const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');

const jwks = jwksClient({
  jwksUri: `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
});

const getSigningKey = (header, callback) => {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
};

const verifyToken = async (token) => {
  // Try ES256/RS256 via JWKS first
  try {
    return await new Promise((resolve, reject) => {
      jwt.verify(token, getSigningKey, { algorithms: ['ES256', 'RS256'] }, (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      });
    });
  } catch (esErr) {
    // Fallback to HS256 with shared secret
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (secret && secret !== 'your-jwt-secret') {
      return new Promise((resolve, reject) => {
        jwt.verify(token, secret, { algorithms: ['HS256'] }, (err, decoded) => {
          if (err) return reject(err);
          resolve(decoded);
        });
      });
    }
    throw esErr;
  }
};

module.exports = { verifyToken };
