const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const MAX_EVENTS = 500;

let events = [];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/dist')));

// POST /api/n8n-webhook/log — receives events from n8n
app.post('/api/n8n-webhook/log', (req, res) => {
  const event = {
    ...req.body,
    receivedAt: new Date().toISOString(),
    _id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
  events.unshift(event);
  if (events.length > MAX_EVENTS) {
    events = events.slice(0, MAX_EVENTS);
  }
  console.log(`[${new Date().toISOString()}] ${event.type} — ${event.emailId || 'N/A'} — ${event.subject || ''}`);
  res.json({ success: true, id: event._id });
});

// GET /api/events — returns all stored events
app.get('/api/events', (req, res) => {
  res.json(events);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', eventCount: events.length, uptime: process.uptime() });
});

// Serve React for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Wrigley Media Group — Email Intelligence Dashboard`);
  console.log(`Server running on port ${PORT}`);
});
