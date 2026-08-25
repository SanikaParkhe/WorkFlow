require("dotenv").config();

const pool = require("./config/db");

async function testDatabaseConnection() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("PostgreSQL connected!");
    console.log("Database time:", result.rows[0].now);
  } catch (error) {
    console.error("Database connection failed:", error.message);
  } finally {
    await pool.end();
  }
}

testDatabaseConnection();