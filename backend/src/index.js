require('dotenv').config();

const createApp = require('./app');
const env = require('./config/env');

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`WorkFlow API running on http://localhost:${env.PORT}`);
  console.log(`Swagger docs at http://localhost:${env.PORT}/api/docs`);
});
