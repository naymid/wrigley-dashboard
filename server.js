const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Database ───────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id        SERIAL PRIMARY KEY,
      type      TEXT NOT NULL,
      email_id  TEXT,
      data      JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS events_received_at_idx ON events (received_at DESC)
  `);
  console.log('Database ready');
}

// ── Middleware ─────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/dist')));

// ── API ────────────────────────────────────────────────────────────────────

// POST /api/n8n-webhook/log — receives events from n8n
app.post('/api/n8n-webhook/log', async (req, res) => {
  try {
    const { type, emailId } = req.body;
    const result = await pool.query(
      `INSERT INTO events (type, email_id, data) VALUES ($1, $2, $3) RETURNING id`,
      [type || 'UNKNOWN', emailId || null, req.body]
    );
    console.log(`[${new Date().toISOString()}] ${type} — ${emailId || 'N/A'} — ${req.body.subject || ''}`);
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events — returns most recent 500 events
app.get('/api/events', async (req, res) => {
  try {
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

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS count FROM events');
    res.json({ status: 'ok', eventCount: parseInt(result.rows[0].count), uptime: process.uptime() });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Serve React for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log('Wrigley Media Group — Email Intelligence Dashboard');
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  });
