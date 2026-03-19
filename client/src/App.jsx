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

const OUTCOME_STYLES = {
  RESPONSE_SENT:      { color: '#4ade80', icon: '↩', label: 'Response sent to' },
  FORWARDED:          { color: '#c084fc', icon: '→', label: 'Forwarded to' },
  SPAM_BLOCKED:       { color: '#f87171', icon: '⊘', label: 'Blocked as spam' },
  FLAGGED_FOR_REVIEW: { color: '#fb923c', icon: '⚑', label: 'Flagged for review' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)   return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function isToday(ts) {
  return new Date(ts).toDateString() === new Date().toDateString()
}

// Group raw events by emailId, merging all events for the same email into one record
function groupByEmail(events) {
  const map = new Map()

  for (const e of events) {
    const key = e.emailId || e._id  // fallback for events without emailId
    if (!map.has(key)) {
      map.set(key, {
        emailId: key,
        subject: null,
        fromEmail: null,
        classification: null,
        outcome: null,         // RESPONSE_SENT | FORWARDED | SPAM_BLOCKED | FLAGGED_FOR_REVIEW
        outingDestination: null, // the email address it went to
        firstSeen: null,
        lastSeen: null,
      })
    }

    const record = map.get(key)
    const ts = e.timestamp || e.receivedAt

    // Track timestamps
    if (!record.firstSeen || ts < record.firstSeen) record.firstSeen = ts
    if (!record.lastSeen  || ts > record.lastSeen)  record.lastSeen  = ts

    // Pull shared fields from any event that has them
    if (e.subject   && !record.subject)   record.subject   = e.subject
    if (e.fromEmail && !record.fromEmail) record.fromEmail = e.fromEmail

    // Classification
    if (e.type === 'CLASSIFICATION') {
      record.classification = e.classification
    }

    // Outcome — what happened after classification
    if (e.type === 'RESPONSE_SENT') {
      record.outcome = 'RESPONSE_SENT'
      record.outingDestination = e.recipientEmail
    }
    if (e.type === 'FORWARDED') {
      record.outcome = 'FORWARDED'
      record.outingDestination = e.forwardedTo || e.teamEmail
    }
    if (e.type === 'SPAM_BLOCKED') {
      record.outcome = 'SPAM_BLOCKED'
    }
    if (e.type === 'FLAGGED_FOR_REVIEW') {
      record.outcome = 'FLAGGED_FOR_REVIEW'
    }
  }

  // Sort by most recent activity first
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)
  )
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

function ClassBadge({ classification }) {
  const color = CLASSIFICATION_COLORS[classification] || '#94a3b8'
  const label = CLASSIFICATION_LABELS[classification] || classification
  return (
    <span className="badge-outline" style={{ borderColor: color + '66', color }}>
      {label}
    </span>
  )
}

function OutcomeLine({ outcome, destination }) {
  const style = OUTCOME_STYLES[outcome]
  if (!style) return null

  const hasDestination = destination && outcome !== 'SPAM_BLOCKED' && outcome !== 'FLAGGED_FOR_REVIEW'

  return (
    <div className="outcome-line" style={{ color: style.color }}>
      <span className="outcome-icon">{style.icon}</span>
      <span className="outcome-label">{style.label}</span>
      {hasDestination && (
        <span className="outcome-destination">{destination}</span>
      )}
    </div>
  )
}

function PendingLine() {
  return (
    <div className="outcome-line outcome-pending">
      <span className="outcome-icon">⋯</span>
      <span className="outcome-label">Awaiting outcome</span>
    </div>
  )
}

function EmailRow({ record }) {
  return (
    <div className="activity-item">
      <div className="activity-header">
        {record.classification
          ? <ClassBadge classification={record.classification} />
          : <span className="badge" style={{ backgroundColor: '#1e293b', color: '#64748b' }}>Unclassified</span>
        }
        <span className="activity-time">{timeAgo(record.lastSeen)}</span>
      </div>

      <div className="activity-subject">{record.subject || '(No subject)'}</div>

      {record.fromEmail && (
        <div className="activity-from">From: {record.fromEmail}</div>
      )}

      {record.outcome
        ? <OutcomeLine outcome={record.outcome} destination={record.outingDestination} />
        : <PendingLine />
      }
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

  // ── Derived data ──
  const emailRecords = groupByEmail(events)

  const classified  = emailRecords.filter(r => r.classification)
  const todayCount  = emailRecords.filter(r => isToday(r.lastSeen)).length
  const spamBlocked = emailRecords.filter(r => r.outcome === 'SPAM_BLOCKED').length
  const flagged     = emailRecords.filter(r => r.outcome === 'FLAGGED_FOR_REVIEW').length

  const classCounts = {}
  classified.forEach(r => {
    classCounts[r.classification] = (classCounts[r.classification] || 0) + 1
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
                      <text x={x - 4} y={y} dy={4} fill="#64748b" fontSize={11} textAnchor="end">
                        {CLASSIFICATION_LABELS[payload.value] || payload.value}
                      </text>
                    )}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.025)' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {chartData.map(entry => (
                      <Cell key={entry.name} fill={CLASSIFICATION_COLORS[entry.name] || '#64748b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="breakdown-list">
                {chartData.map(({ name, count }) => {
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  const color = CLASSIFICATION_COLORS[name] || '#64748b'
                  return (
                    <div key={name} className="breakdown-item">
                      <div className="breakdown-dot" style={{ background: color }} />
                      <div className="breakdown-label">{CLASSIFICATION_LABELS[name] || name}</div>
                      <div className="breakdown-bar-wrap">
                        <div className="breakdown-bar" style={{ width: `${pct}%`, background: color }} />
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

        {/* ── Email Feed ── */}
        <div className="section">
          <h2 className="section-title">
            Email Activity
            <span className="feed-count">{emailRecords.length} emails</span>
          </h2>
          <div className="feed-card">
            {loading && emailRecords.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⟳</div>
                <div className="empty-title">Loading…</div>
              </div>
            ) : emailRecords.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <div className="empty-title">No emails yet</div>
                <div className="empty-sub">Emails will appear here as n8n processes them</div>
              </div>
            ) : (
              emailRecords.map(record => (
                <EmailRow key={record.emailId} record={record} />
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
