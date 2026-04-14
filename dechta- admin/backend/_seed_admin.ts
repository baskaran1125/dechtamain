import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:Quickconstruct@12@localhost:5432/postgres' });
try {
  const result = await pool.query(
    "INSERT INTO users (name, email, password, role) VALUES ('Admin', 'admin@example.com', 'password123', 'admin') ON CONFLICT (email) DO NOTHING RETURNING *"
  );
  if (result.rows.length > 0) {
    console.log('Admin user created:', result.rows[0]);
  } else {
    console.log('Admin user already exists.');
  }
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error('Error:', message);
} finally {
  await pool.end();
}
