const { Pool } = require('pg');

require('dotenv').config();

console.log('Testing Database Connection...');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('✗ Pool Error:', err.message);
  console.error('Full error object:', err);
});

async function test() {
  try {
    console.log('\nAttempting connection...');
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✓ Connected successfully!');
    console.log('Server time:', result.rows[0].current_time);
    
    // Try to list tables
    const tablesResult = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    console.log(`\nTables in database (${tablesResult.rows.length}):`);
    tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
  } catch (error) {
    console.error('✗ Connection failed!');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error details:', {
      host: error.host,
      port: error.port,
      database: error.database,
      user: error.user,
    });
  } finally {
    await pool.end();
    process.exit(0);
  }
}

test();
