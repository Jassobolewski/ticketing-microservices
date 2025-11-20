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
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log("Tickets table ready");
}

// POST / - Create a new ticket
app.post("/", authenticate, async (req, res) => {
  try {
    const { title, description, category } = req.body;

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

    const result = await pool.query(
      `INSERT INTO tickets (user_id, title, description, category)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, title, description, category, status, created_at`,
      [req.user.sub, title, description, category.toLowerCase()],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET / - List tickets for the authenticated user
app.get("/", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, title, description, category, status, created_at
       FROM tickets
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.sub],
    );

    res.json({ tickets: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /:id - Get a specific ticket (only if owned by user)
app.get("/:id", authenticate, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "invalid ticket id" });
    }

    const result = await pool.query(
      `SELECT id, user_id, title, description, category, status, created_at
       FROM tickets
       WHERE id = $1 AND user_id = $2`,
      [ticketId, req.user.sub],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "ticket not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

const PORT = process.env.PORT || 3002;

init().then(() => {
  app.listen(PORT, () => {
    console.log(`Ticket Intake service running on port ${PORT}`);
  });
});
