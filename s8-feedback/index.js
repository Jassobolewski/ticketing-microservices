const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const axios = require("axios");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const REGISTRY_URL = process.env.REGISTRY_URL || "http://s3-registry:3003";

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

// Initialize feedback table on startup
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(ticket_id, user_id)
    );
  `);

  // Create indexes for faster lookups
  await pool
    .query(`CREATE INDEX IF NOT EXISTS idx_feedback_ticket_id ON feedback(ticket_id);`)
    .catch(() => {});

  await pool
    .query(`CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);`)
    .catch(() => {});

  console.log("Feedback table ready");
}

// Notify Analytics service to refresh cache
async function notifyAnalytics(token) {
  try {
    // Discover Analytics service from registry
    const discoveryResponse = await axios.get(
      `${REGISTRY_URL}/discover/s7-analytics`,
      { timeout: 3000 }
    );

    const analyticsUrl = discoveryResponse.data.url;

    // Trigger cache refresh
    await axios.post(
      `${analyticsUrl}/refresh`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 5000,
      }
    );

    console.log("[Analytics] Notified Analytics service to refresh cache");
  } catch (err) {
    console.warn("[Analytics] Failed to notify Analytics service:", err.message);
    // Don't fail the request if Analytics is unavailable
  }
}

// Health check endpoint (MUST come before /:id)
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "s8-feedback" });
});

// POST / - Submit feedback for a ticket
app.post("/", authenticate, async (req, res) => {
  try {
    const { ticket_id, rating, comment } = req.body;

    // Validate required fields
    if (!ticket_id || !rating) {
      return res.status(400).json({
        error: "ticket_id and rating are required",
      });
    }

    const ticketId = parseInt(ticket_id);
    const ratingValue = parseInt(rating);

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "invalid ticket_id" });
    }

    if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({
        error: "rating must be an integer between 1 and 5",
      });
    }

    // Check if ticket exists
    const ticketCheck = await pool.query(
      `SELECT id FROM tickets WHERE id = $1`,
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: "ticket not found" });
    }

    // Insert or update feedback (UPSERT)
    const result = await pool.query(
      `INSERT INTO feedback (ticket_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (ticket_id, user_id)
       DO UPDATE SET
         rating = EXCLUDED.rating,
         comment = EXCLUDED.comment,
         created_at = NOW()
       RETURNING id, ticket_id, user_id, rating, comment, created_at`,
      [ticketId, req.user.sub, ratingValue, comment || null]
    );

    const feedback = result.rows[0];

    // Notify Analytics service to refresh cache (async, don't wait)
    const token = req.headers.authorization.split(" ")[1];
    notifyAnalytics(token).catch(() => {});

    res.status(201).json(feedback);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /ticket/:ticketId - Get all feedback for a ticket
app.get("/ticket/:ticketId", authenticate, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.ticketId);

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "invalid ticket id" });
    }

    const result = await pool.query(
      `SELECT id, ticket_id, user_id, rating, comment, created_at
       FROM feedback
       WHERE ticket_id = $1
       ORDER BY created_at DESC`,
      [ticketId]
    );

    // Calculate average rating for this ticket
    const avgResult = await pool.query(
      `SELECT AVG(rating) as avg_rating, COUNT(*) as total_feedback
       FROM feedback
       WHERE ticket_id = $1`,
      [ticketId]
    );

    const avgRating = avgResult.rows[0].avg_rating
      ? parseFloat(avgResult.rows[0].avg_rating).toFixed(2)
      : null;

    res.json({
      feedback: result.rows,
      average_rating: avgRating ? parseFloat(avgRating) : null,
      total_feedback: parseInt(avgResult.rows[0].total_feedback),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /user/:userId - Get all feedback from a user
app.get("/user/:userId", authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ error: "invalid user id" });
    }

    // Staff can view any user's feedback, regular users only their own
    const isStaff = req.user.role === "staff" || req.user.role === "admin";

    if (!isStaff && req.user.sub !== userId) {
      return res.status(403).json({ error: "permission denied" });
    }

    const result = await pool.query(
      `SELECT id, ticket_id, user_id, rating, comment, created_at
       FROM feedback
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ feedback: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /stats - Get overall feedback statistics (staff only)
app.get("/stats", authenticate, async (req, res) => {
  try {
    const isStaff = req.user.role === "staff" || req.user.role === "admin";

    if (!isStaff) {
      return res.status(403).json({ error: "staff access required" });
    }

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_feedback,
        AVG(rating) as average_rating,
        MIN(rating) as min_rating,
        MAX(rating) as max_rating,
        COUNT(DISTINCT ticket_id) as tickets_with_feedback,
        COUNT(DISTINCT user_id) as users_who_gave_feedback
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

// DELETE /:id - Delete feedback (owner only or staff)
app.delete("/:id", authenticate, async (req, res) => {
  try {
    const feedbackId = parseInt(req.params.id);

    if (isNaN(feedbackId)) {
      return res.status(400).json({ error: "invalid feedback id" });
    }

    const isStaff = req.user.role === "staff" || req.user.role === "admin";

    // Get feedback info
    const feedbackResult = await pool.query(
      `SELECT id, user_id FROM feedback WHERE id = $1`,
      [feedbackId]
    );

    if (feedbackResult.rows.length === 0) {
      return res.status(404).json({ error: "feedback not found" });
    }

    const feedback = feedbackResult.rows[0];

    // Check permission: staff or feedback owner
    if (!isStaff && feedback.user_id !== req.user.sub) {
      return res.status(403).json({ error: "permission denied" });
    }

    // Delete feedback
    await pool.query(`DELETE FROM feedback WHERE id = $1`, [feedbackId]);

    // Notify Analytics service to refresh cache (async)
    const token = req.headers.authorization.split(" ")[1];
    notifyAnalytics(token).catch(() => {});

    res.json({ message: "feedback deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

const PORT = process.env.PORT || 3008;
const registerService = require("./register-helper");

init().then(() => {
  app.listen(PORT, async () => {
    console.log(`S8 Feedback service running on port ${PORT}`);

    // Register with service registry
    await registerService("s8-feedback", "s8-feedback", PORT, "/health");
  });
});
