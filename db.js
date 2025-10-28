// db.js
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config(); // Ensure environment variables are loaded

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // If you're using Heroku Postgres, you might need SSL configuration:
  ssl: {
    rejectUnauthorized: false // Necessary for Heroku Postgres connections from outside Heroku
  }
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database!');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool: pool // Export the pool itself if needed for transactions etc.
};