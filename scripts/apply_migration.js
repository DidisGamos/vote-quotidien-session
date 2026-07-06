import { readFile } from 'node:fs/promises';
import pg from 'pg';

async function main() {
  // load connection string from env or .env file
  const envRaw = await readFile('.env', 'utf8').catch(() => null) || await readFile('.env.local', 'utf8').catch(() => null);
  let conn = process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL || process.env.DATABASE_URL;
  if (!conn && envRaw) {
    const m = envRaw.match(/SUPABASE_CONNECTION_STRING\s*=\s*"?(.*?)"?$/m);
    if (m) conn = m[1];
  }
  if (!conn) {
    console.error('Aucune connection string trouvée. Définissez SUPABASE_CONNECTION_STRING ou DATABASE_URL.');
    process.exit(2);
  }

  const sql = await readFile('supabase/schema.sql', 'utf8');

  const pool = new pg.Pool({
    connectionString: conn,
    ssl: conn.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    console.log('Début de la migration...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration appliquée avec succès.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erreur durant la migration :', err.message || err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
