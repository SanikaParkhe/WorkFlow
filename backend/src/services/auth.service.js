const pool = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken } = require('../utils/jwt');
const { generateRefreshToken, hashToken } = require('../utils/token');
const userRepository = require('../repositories/user.repository');
const refreshTokenRepository = require('../repositories/refreshToken.repository');

const buildAuthResponse = (user, accessToken, refreshToken) => ({
  user: {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  },
  accessToken,
  refreshToken,
});

const getRefreshExpiry = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS);
  return expiresAt;
};

const issueTokens = async (user) => {
  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);

  await refreshTokenRepository.create(null, {
    userId: user.id,
    tokenHash,
    expiresAt: getRefreshExpiry(),
  });

  return { accessToken, refreshToken };
};

const register = async ({ email, password, name, role }) => {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.create({
    email,
    passwordHash,
    name,
    role: role || 'developer',
  });

  const tokens = await issueTokens(user);
  return buildAuthResponse(user, tokens.accessToken, tokens.refreshToken);
};

const login = async ({ email, password }) => {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const tokens = await issueTokens(user);
  return buildAuthResponse(user, tokens.accessToken, tokens.refreshToken);
};

const refresh = async (refreshToken) => {
  const tokenHash = hashToken(refreshToken);
  const stored = await refreshTokenRepository.findValidByHash(null, tokenHash);

  if (!stored) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  // Rotation must be atomic: revoke old token and issue new one in one transaction.
  // Without this, a replayed token could produce two valid sessions.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const locked = await refreshTokenRepository.findValidByHash(client, tokenHash);
    if (!locked) {
      throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    await refreshTokenRepository.revokeById(client, locked.id);

    const user = await userRepository.findById(locked.user_id);
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const newRefreshToken = generateRefreshToken();
    const newTokenHash = hashToken(newRefreshToken);

    await refreshTokenRepository.create(client, {
      userId: user.id,
      tokenHash: newTokenHash,
      expiresAt: getRefreshExpiry(),
    });

    await client.query('COMMIT');

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const logout = async (refreshToken) => {
  const tokenHash = hashToken(refreshToken);
  const stored = await refreshTokenRepository.findValidByHash(null, tokenHash);

  if (stored) {
    await refreshTokenRepository.revokeById(null, stored.id);
  }
};

const getProfile = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user;
};

const updateProfile = async (userId, data) => {
  if (data.email) {
    const existing = await userRepository.findByEmail(data.email);
    if (existing && existing.id !== userId) {
      throw new AppError('Email already in use', 409, 'EMAIL_EXISTS');
    }
  }

  const user = await userRepository.updateProfile(userId, data);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await userRepository.findByIdWithPassword(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const valid = await comparePassword(currentPassword, user.password_hash);
  if (!valid) {
    throw new AppError('Current password is incorrect', 401, 'INVALID_PASSWORD');
  }

  const passwordHash = await hashPassword(newPassword);
  await userRepository.updatePassword(userId, passwordHash);

  // Invalidate all refresh tokens so stolen sessions can't persist after password change
  await refreshTokenRepository.revokeAllForUser(null, userId);
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  getProfile,
  updateProfile,
  changePassword,
};
