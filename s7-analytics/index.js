const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Cache configuration
const CACHE_REFRESH_INTERVAL_MS = 60000; // 1 minute
let metricsCache = null;
let lastCacheUpdate = null;

// Middleware to verify JWT and extract user info
function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");
    if (!token) {
      return res.status(401).json({ error: "missing token" });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { sub: userId, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

// Middleware to check if user is staff/admin
function requireStaff(req, res, next) {
  const isStaff = req.user.role === "staff" || req.user.role === "admin";
  if (!isStaff) {
    return res.status(403).json({ error: "staff access required" });
  }
  next();
}

// Initialize analytics (no tables needed, reads from other services' tables)
async function init() {
  console.log("Analytics service initialized");
  // Perform initial cache load
  await refreshMetricsCache();
}

// Aggregate ticket statistics from database
async function aggregateTicketMetrics() {
  try {
    // Total tickets
    const totalResult = await pool.query(`SELECT COUNT(*) as total FROM tickets`);
    const total = parseInt(totalResult.rows[0].total);

    // Tickets by status
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM tickets
      GROUP BY status
      ORDER BY count DESC
    `);

    // Tickets by category
    const categoryResult = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM tickets
      GROUP BY category
      ORDER BY count DESC
    `);

    // Tickets by priority
    const priorityResult = await pool.query(`
      SELECT priority, COUNT(*) as count
      FROM tickets
      GROUP BY priority
      ORDER BY count DESC
    `);

    // Recent ticket creation trend (last 7 days)
    const trendResult = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM tickets
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    return {
      total,
      by_status: statusResult.rows,
      by_category: categoryResult.rows,
      by_priority: priorityResult.rows,
      recent_trend: trendResult.rows,
    };
  } catch (err) {
    console.error("Error aggregating ticket metrics:", err);
    return null;
  }
}

// Aggregate feedback statistics from database
async function aggregateFeedbackMetrics() {
  try {
    // Check if feedback table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'feedback'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      // Feedback table doesn't exist yet (S8 not deployed)
      return {
        total: 0,
        average_rating: 0,
        by_rating: [],
      };
    }

    // Total feedback entries
    const totalResult = await pool.query(`SELECT COUNT(*) as total FROM feedback`);
    const total = parseInt(totalResult.rows[0].total);

    // Average rating
    const avgResult = await pool.query(`SELECT AVG(rating) as avg_rating FROM feedback`);
    const averageRating = avgResult.rows[0].avg_rating
      ? parseFloat(avgResult.rows[0].avg_rating).toFixed(2)
      : 0;

    // Feedback by rating
    const ratingResult = await pool.query(`
      SELECT rating, COUNT(*) as count
      FROM feedback
      GROUP BY rating
      ORDER BY rating DESC
    `);

    return {
      total,
      average_rating: parseFloat(averageRating),
      by_rating: ratingResult.rows,
    };
  } catch (err) {
    console.error("Error aggregating feedback metrics:", err);
    return {
      total: 0,
      average_rating: 0,
      by_rating: [],
    };
  }
}

// Refresh the metrics cache
async function refreshMetricsCache() {
  console.log("[Cache] Refreshing metrics cache...");

  const ticketMetrics = await aggregateTicketMetrics();
  const feedbackMetrics = await aggregateFeedbackMetrics();

  if (ticketMetrics) {
    metricsCache = {
      tickets: ticketMetrics,
      feedback: feedbackMetrics,
      cached_at: new Date().toISOString(),
    };
    lastCacheUpdate = Date.now();
    console.log("[Cache] Metrics cache refreshed successfully");
  } else {
    console.error("[Cache] Failed to refresh metrics cache");
  }
}

// Periodic cache refresh
setInterval(() => {
  refreshMetricsCache();
}, CACHE_REFRESH_INTERVAL_MS);

// Health check endpoint (MUST come before /:id)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "s7-analytics",
    cache_age_seconds: lastCacheUpdate
      ? Math.floor((Date.now() - lastCacheUpdate) / 1000)
      : null,
  });
});

// GET /metrics - Get aggregated metrics (staff only)
app.get("/metrics", authenticate, requireStaff, async (req, res) => {
  try {
    if (!metricsCache) {
      // Cache not ready yet, generate on-demand
      await refreshMetricsCache();
    }

    res.json(metricsCache);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /dashboard - Get comprehensive dashboard data (staff only)
app.get("/dashboard", authenticate, requireStaff, async (req, res) => {
  try {
    if (!metricsCache) {
      await refreshMetricsCache();
    }

    // Additional real-time queries for dashboard
    const activeUsersResult = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as active_users
      FROM tickets
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);

    const recentTicketsResult = await pool.query(`
      SELECT id, title, status, priority, created_at
      FROM tickets
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      metrics: metricsCache,
      active_users: parseInt(activeUsersResult.rows[0].active_users),
      recent_tickets: recentTicketsResult.rows,
      dashboard_generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// POST /refresh - Manually trigger cache refresh (staff only)
app.post("/refresh", authenticate, requireStaff, async (req, res) => {
  try {
    await refreshMetricsCache();

    res.json({
      message: "cache refreshed successfully",
      cached_at: metricsCache.cached_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /tickets/stats - Get detailed ticket statistics (staff only)
app.get("/tickets/stats", authenticate, requireStaff, async (req, res) => {
  try {
    // Time-based statistics
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as last_7d,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as last_30d,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_count,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_count
      FROM tickets
    `);

    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /feedback/stats - Get detailed feedback statistics (staff only)
app.get("/feedback/stats", authenticate, requireStaff, async (req, res) => {
  try {
    // Check if feedback table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'feedback'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      return res.json({
        total: 0,
        average_rating: 0,
        ratings: [],
        message: "Feedback service not yet deployed",
      });
    }

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        AVG(rating) as average_rating,
        MIN(rating) as min_rating,
        MAX(rating) as max_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
      FROM feedback
    `);

    const result = stats.rows[0];
    result.average_rating = result.average_rating
      ? parseFloat(result.average_rating).toFixed(2)
      : 0;

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

const PORT = process.env.PORT || 3007;
const registerService = require("./register-helper");

init().then(() => {
  app.listen(PORT, async () => {
    console.log(`S7 Analytics service running on port ${PORT}`);

    // Register with service registry
    await registerService("s7-analytics", "s7-analytics", PORT, "/health");
  });
});
