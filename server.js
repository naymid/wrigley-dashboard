const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Database ───────────────────────────────────────────────────────────────

let pool = null;
let dbReady = false;

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set — running without database (events will not persist)');
    return;
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id          SERIAL PRIMARY KEY,
      type        TEXT NOT NULL,
      email_id    TEXT,
      data        JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS events_received_at_idx ON events (received_at DESC)
  `);

  dbReady = true;
  console.log('Database connected and ready');
}

// ── Middleware ─────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'client/dist')));

// ── API ────────────────────────────────────────────────────────────────────

app.post('/api/n8n-webhook/log', async (req, res) => {
  try {
    const { type, emailId } = req.body;
    if (dbReady) {
      const result = await pool.query(
        `INSERT INTO events (type, email_id, data) VALUES ($1, $2, $3) RETURNING id`,
        [type || 'UNKNOWN', emailId || null, req.body]
      );
      console.log(`[${new Date().toISOString()}] ${type} — ${emailId || 'N/A'} — ${req.body.subject || ''}`);
      return res.json({ success: true, id: result.rows[0].id });
    }
    // No DB — acknowledge but warn
    console.warn('Event received but database not connected — event not persisted');
    res.json({ success: true, warning: 'Database not connected, event not persisted' });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    if (!dbReady) return res.json([]);
    const result = await pool.query(
      `SELECT data || jsonb_build_object('_id', id, 'receivedAt', received_at) AS event
       FROM events
       ORDER BY received_at DESC
       LIMIT 500`
    );
    res.json(result.rows.map(r => r.event));
  } catch (err) {
    console.error('Events error:', err.message);
    res.status(500).json([]);
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const count = dbReady
      ? parseInt((await pool.query('SELECT COUNT(*) AS c FROM events')).rows[0].c)
      : 0;
    res.json({ status: 'ok', db: dbReady, eventCount: count, uptime: process.uptime() });
  } catch (err) {
    res.json({ status: 'ok', db: false, uptime: process.uptime() });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

// ── Start — listen first, then connect DB ──────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log('Wrigley Media Group — Email Intelligence Dashboard');
  console.log(`Server listening on port ${PORT}`);

  initDb().catch(err => {
    console.error('Database connection failed:', err.message);
  });
});
