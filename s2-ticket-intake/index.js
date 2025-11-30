const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

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

// Initialize tickets table on startup
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      priority TEXT NOT NULL DEFAULT 'medium',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Add priority column if it doesn't exist (for existing databases)
  await pool
    .query(
      `
    ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
  `,
    )
    .catch(() => {
      // Column might already exist, ignore error
    });

  console.log("Tickets table ready");
}

// Auto-priority mapping based on category
const CATEGORY_PRIORITY_MAP = {
  bug: "high",
  feature: "medium",
  support: "medium",
  other: "low",
};

// POST / - Create a new ticket
app.post("/", authenticate, async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;

    // Validate required fields
    if (!title || !description || !category) {
      return res.status(400).json({
        error: "title, description, and category are required",
      });
    }

    // Validate category is one of the expected values
    const validCategories = ["bug", "feature", "support", "other"];
    if (!validCategories.includes(category.toLowerCase())) {
      return res.status(400).json({
        error: `category must be one of: ${validCategories.join(", ")}`,
      });
    }

    // Validate priority if provided
    const validPriorities = ["low", "medium", "high", "urgent"];
    const ticketPriority = priority ? priority.toLowerCase() : "medium";
    if (!validPriorities.includes(ticketPriority)) {
      return res.status(400).json({
        error: `priority must be one of: ${validPriorities.join(", ")}`,
      });
    }

    const result = await pool.query(
      `INSERT INTO tickets (user_id, title, description, category, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, title, description, category, status, priority, created_at`,
      [
        req.user.sub,
        title,
        description,
        category.toLowerCase(),
        ticketPriority,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET / - List tickets (users see their own, staff see all)
app.get("/", authenticate, async (req, res) => {
  try {
    // Staff/Admin can see all tickets, regular users only see their own
    const isStaff = req.user.role === "staff" || req.user.role === "admin";

    let query, params;

    if (isStaff) {
      query = `SELECT id, user_id, title, description, category, status, priority, created_at
               FROM tickets
               ORDER BY created_at DESC`;
      params = [];
    } else {
      query = `SELECT id, user_id, title, description, category, status, priority, created_at
               FROM tickets
               WHERE user_id = $1
               ORDER BY created_at DESC`;
      params = [req.user.sub];
    }

    result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /:id - Get a specific ticket (staff can view any, users only their own)
app.get("/:id", authenticate, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "invalid ticket id" });
    }

    // Staff/Admin can view any ticket, regular users only their own
    const isStaff = req.user.role === "staff" || req.user.role === "admin";

    let query, params;

    if (isStaff) {
      query = `SELECT id, user_id, title, description, category, status, priority, created_at
               FROM tickets
               WHERE id = $1`;
      params = [ticketId];
    } else {
      query = `SELECT id, user_id, title, description, category, status, priority, created_at
               FROM tickets
               WHERE id = $1 AND user_id = $2`;
      params = [ticketId, req.user.sub];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "ticket not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// PATCH /:id - Update ticket (status, priority, etc.) - MUST RETURN JSON
app.patch("/:id", authenticate, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "invalid ticket id" });
    }

    const { status, priority } = req.body;

    // Validate that at least one field is provided
    if (!status && !priority) {
      return res.status(400).json({
        error: "at least one field (status or priority) is required",
      });
    }

    // Validate priority if provided
    if (priority) {
      const validPriorities = ["low", "medium", "high", "urgent"];
      if (!validPriorities.includes(priority.toLowerCase())) {
        return res.status(400).json({
          error: `priority must be one of: ${validPriorities.join(", ")}`,
        });
      }
    }

    // Build dynamic UPDATE query based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount}`);
      values.push(status.toLowerCase());
      paramCount++;
    }

    if (priority) {
      updates.push(`priority = $${paramCount}`);
      values.push(priority.toLowerCase());
      paramCount++;
    }

    // Add ticket ID and user ID to values
    values.push(ticketId, req.user.sub);

    const result = await pool.query(
      `UPDATE tickets
       SET ${updates.join(", ")}
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
       RETURNING id, user_id, title, description, category, status, priority, created_at`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "ticket not found" });
    }

    // CRITICAL: Always return JSON response
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "s2-tickets" });
});

const PORT = process.env.PORT || 3002;
const registerService = require('./register-helper');

init().then(() => {
  app.listen(PORT, async () => {
    console.log(`S2 Ticket Intake service running on port ${PORT}`);

    // Register with service registry
    await registerService('s2-tickets', 's2-ticket-intake', PORT, '/health');
  });
});
