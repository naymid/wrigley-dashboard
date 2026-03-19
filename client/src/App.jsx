import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import './index.css'

// ── Constants ──────────────────────────────────────────────────────────────

const CLASSIFICATION_COLORS = {
  NEW_BUSINESS_LEAD:       '#22c55e',
  RETURNING_CLIENT:        '#3b82f6',
  KENTUCKY_FILM_INCENTIVE: '#a855f7',
  RENTALS:                 '#06b6d4',
  WRIGLEY_CANDY_MISDIRECT: '#f59e0b',
  SPAM:                    '#ef4444',
  JOB_APPLICANT:           '#f97316',
  UNSOLICITED_PITCH:       '#ec4899',
  GENERAL_INQUIRY:         '#64748b',
}

const CLASSIFICATION_LABELS = {
  NEW_BUSINESS_LEAD:       'New Business Lead',
  RETURNING_CLIENT:        'Returning Client',
  KENTUCKY_FILM_INCENTIVE: 'KY Film Incentive',
  RENTALS:                 'Rentals',
  WRIGLEY_CANDY_MISDIRECT: 'Candy Misdirect',
  SPAM:                    'Spam',
  JOB_APPLICANT:           'Job Applicant',
  UNSOLICITED_PITCH:       'Unsolicited Pitch',
  GENERAL_INQUIRY:         'General Inquiry',
}

const EVENT_TYPE_STYLES = {
  CLASSIFICATION:    { bg: '#1e3a5f', color: '#60a5fa', label: 'Classified' },
  RESPONSE_SENT:     { bg: '#14532d', color: '#4ade80', label: 'Response Sent' },
  FORWARDED:         { bg: '#3b1f6e', color: '#c084fc', label: 'Forwarded' },
  SPAM_BLOCKED:      { bg: '#450a0a', color: '#f87171', label: 'Spam Blocked' },
  FLAGGED_FOR_REVIEW:{ bg: '#451a03', color: '#fb923c', label: 'Flagged' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function isToday(ts) {
  return new Date(ts).toDateString() === new Date().toDateString()
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, subtitle, accentColor }) {
  return (
    <div className="stat-card" style={{ '--accent-line': accentColor }}>
      <div className="stat-value" style={{ color: accentColor }}>{value}</div>
      <div className="stat-label">{label}</div>
      {subtitle && <div className="stat-subtitle">{subtitle}</div>}
    </div>
  )
}

function EventBadge({ type }) {
  const s = EVENT_TYPE_STYLES[type] || { bg: '#1e293b', color: '#94a3b8', label: type }
  return (
    <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function ClassBadge({ classification }) {
  const color = CLASSIFICATION_COLORS[classification] || '#94a3b8'
  const label = CLASSIFICATION_LABELS[classification] || classification
  return (
    <span className="badge-outline" style={{ borderColor: color + '66', color }}>
      {label}
    </span>
  )
}

function ActivityItem({ event }) {
  const ts = event.timestamp || event.receivedAt
  return (
    <div className="activity-item">
      <div className="activity-header">
        <EventBadge type={event.type} />
        {event.classification && <ClassBadge classification={event.classification} />}
        <span className="activity-time">{timeAgo(ts)}</span>
      </div>
      <div className="activity-subject">{event.subject || '(No subject)'}</div>
      <div className="activity-meta">
        {event.fromEmail     && <span className="activity-email">From: {event.fromEmail}</span>}
        {event.recipientEmail && <span className="activity-email">To: {event.recipientEmail}</span>}
        {event.forwardedTo   && <span className="activity-email">Fwd → {event.forwardedTo}</span>}
        {event.teamEmail     && <span className="activity-email">Team: {event.teamEmail}</span>}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const name = payload[0].payload.name
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{CLASSIFICATION_LABELS[name] || name}</div>
      <div className="tooltip-value">{payload[0].value} emails</div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  const [events, setEvents]           = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setEvents(await res.json())
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
    const id = setInterval(fetchEvents, 30_000)
    return () => clearInterval(id)
  }, [fetchEvents])

  // ── Derived stats ──
  const classified   = events.filter(e => e.type === 'CLASSIFICATION')
  const todayCount   = events.filter(e => isToday(e.timestamp || e.receivedAt)).length
  const spamBlocked  = events.filter(e => e.type === 'SPAM_BLOCKED').length
  const flagged      = events.filter(e => e.type === 'FLAGGED_FOR_REVIEW').length

  const classCounts = {}
  classified.forEach(e => {
    if (e.classification) classCounts[e.classification] = (classCounts[e.classification] || 0) + 1
  })

  const chartData = Object.entries(classCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const total = chartData.reduce((s, d) => s + d.count, 0)

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">▶</div>
            <div>
              <div className="logo-title">Wrigley Media Group</div>
              <div className="logo-subtitle">Email Intelligence</div>
            </div>
          </div>

          <div className="header-meta">
            {lastUpdated && (
              <span className="last-updated">Updated {timeAgo(lastUpdated)}</span>
            )}
            <button className="refresh-btn" onClick={fetchEvents} disabled={loading}>
              ↻ Refresh
            </button>
            <div className="status-pill">
              <div className={`status-dot ${error ? 'status-error' : 'status-live'}`} />
              <span className="status-text">{error ? 'Error' : 'Live'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="main">

        {/* ── Stat Cards ── */}
        <div className="stats-grid">
          <StatCard
            label="Emails Classified"
            value={classified.length.toLocaleString()}
            subtitle="Total processed by AI"
            accentColor="#f59e0b"
          />
          <StatCard
            label="Processed Today"
            value={todayCount.toLocaleString()}
            subtitle={todayLabel}
            accentColor="#60a5fa"
          />
          <StatCard
            label="Spam Blocked"
            value={spamBlocked.toLocaleString()}
            subtitle="Auto-filtered"
            accentColor="#f87171"
          />
          <StatCard
            label="Flagged for Review"
            value={flagged.toLocaleString()}
            subtitle="Needs attention"
            accentColor="#fb923c"
          />
        </div>

        {/* ── Classification Breakdown ── */}
        {chartData.length > 0 && (
          <div className="section">
            <h2 className="section-title">
              Classification Breakdown
              <span className="feed-count">{total} emails</span>
            </h2>
            <div className="chart-grid">

              {/* Bar chart */}
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 0, right: 24, top: 4, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    axisLine={false}
                    tickLine={false}
                    tick={({ x, y, payload }) => (
                      <text
                        x={x - 4} y={y} dy={4}
                        fill="#64748b" fontSize={11}
                        textAnchor="end"
                      >
                        {CLASSIFICATION_LABELS[payload.value] || payload.value}
                      </text>
                    )}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.025)' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {chartData.map(entry => (
                      <Cell
                        key={entry.name}
                        fill={CLASSIFICATION_COLORS[entry.name] || '#64748b'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Breakdown list */}
              <div className="breakdown-list">
                {chartData.map(({ name, count }) => {
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  const color = CLASSIFICATION_COLORS[name] || '#64748b'
                  return (
                    <div key={name} className="breakdown-item">
                      <div className="breakdown-dot" style={{ background: color }} />
                      <div className="breakdown-label">
                        {CLASSIFICATION_LABELS[name] || name}
                      </div>
                      <div className="breakdown-bar-wrap">
                        <div
                          className="breakdown-bar"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                      <div className="breakdown-count">{count}</div>
                      <div className="breakdown-pct">{pct}%</div>
                    </div>
                  )
                })}
              </div>

            </div>
          </div>
        )}

        {/* ── Activity Feed ── */}
        <div className="section">
          <h2 className="section-title">
            Live Activity Feed
            <span className="feed-count">{events.length} events</span>
          </h2>
          <div className="feed-card">
            {loading && events.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⟳</div>
                <div className="empty-title">Loading events…</div>
              </div>
            ) : events.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <div className="empty-title">No events yet</div>
                <div className="empty-sub">
                  Events will appear here as n8n processes emails in real time
                </div>
              </div>
            ) : (
              events.map((event, i) => (
                <ActivityItem
                  key={event._id || `${event.emailId}-${i}`}
                  event={event}
                />
              ))
            )}
          </div>
        </div>

        <footer className="footer">
          Wrigley Media Group &middot; Email Intelligence Dashboard &middot; Auto-refreshes every 30 seconds
        </footer>
      </main>
    </div>
  )
}
