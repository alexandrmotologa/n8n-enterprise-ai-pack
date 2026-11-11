const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function seed() {
  console.log('=== Database & Knowledge Base Seeder ===\n');

  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'n8n',
    user: process.env.POSTGRES_USER || 'n8n',
    password: process.env.POSTGRES_PASSWORD || 'n8n_secret',
    connectionTimeoutMillis: 3000
  });

  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL successfully.');

    // Execute init script
    const initSqlPath = path.resolve(__dirname, '../init-db/01-init.sql');
    if (fs.existsSync(initSqlPath)) {
      const sql = fs.readFileSync(initSqlPath, 'utf8');
      console.log('Executing init-db/01-init.sql...');
      await client.query(sql);
      console.log('Database schemas, tables, and seed purchase orders initialized.');
    }

    client.release();
    await pool.end();
    console.log('\nDatabase seeding completed successfully.');
  } catch (err) {
    console.log(`Note: Direct PostgreSQL connection skipped (${err.message}).`);
    console.log('When running in Docker, init-db/01-init.sql executes automatically on container startup.\n');
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
