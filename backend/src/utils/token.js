const crypto = require('crypto');

// Refresh tokens are opaque random strings — we store a SHA-256 hash in the DB.
// Hashing (not bcrypt) is fine here: tokens are high-entropy secrets, not user passwords.
const generateRefreshToken = () => crypto.randomBytes(32).toString('hex');

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

module.exports = { generateRefreshToken, hashToken };
