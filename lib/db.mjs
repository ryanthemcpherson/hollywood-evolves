import pg from 'pg';

// Both drivers are narrowed to query() -> { rows } so repositories never depend on driver-specific result fields.
function queryable(runner) {
  return { query: async (sql, params = []) => ({ rows: (await runner.query(sql, params)).rows }) };
}

function pgliteDatabase(pglite) {
  return {
    ...queryable(pglite),
    withTransaction: (fn) => pglite.transaction((tx) => fn(queryable(tx))),
    close: async () => { if (!pglite.closed) await pglite.close(); },
  };
}

function pgDatabase(pool) {
  return {
    ...queryable(pool),
    async withTransaction(fn) {
      const client = await pool.connect();
      let brokenConnection;
      try {
        await client.query('BEGIN');
        const result = await fn(queryable(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        // A failed ROLLBACK means the connection itself is unusable, so it must not return to the pool.
        await client.query('ROLLBACK').catch((rollbackError) => { brokenConnection = rollbackError; });
        throw error;
      } finally {
        client.release(brokenConnection);
      }
    },
    close: () => pool.end(),
  };
}

export function createDatabase({ connectionString, pglite, onError = () => {} } = {}) {
  if (pglite) return pgliteDatabase(pglite);
  if (typeof connectionString !== 'string' || !connectionString) throw new Error('A Postgres connection string is required');
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, query_timeout: 15_000 });
  // An idle client that loses its connection emits on the pool; without a listener Node would crash the process.
  pool.on('error', onError);
  return pgDatabase(pool);
}
