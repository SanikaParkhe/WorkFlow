const request = require('supertest');

const registerAndLogin = async (app, user) => {
  const res = await request(app).post('/api/auth/register').send(user);
  return {
    user: res.body.data.user,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
};

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { registerAndLogin, authHeader };
