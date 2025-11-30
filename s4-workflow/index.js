const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Service Discovery URL for Notifications (Docker internal DNS)
const NOTIFICATION_SERVICE_URL = "http://s6-notifications:3006";

// Valid workflow states and priorities
const VALID_STATUSES = ["new", "assigned", "in_progress", "resolved"];
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"];

// Status flow validation
const STATUS_TRANSITIONS = {
  new: ["assigned", "in_progress", "resolved"],
  assigned: ["new", "in_progress", "resolved"],
  in_progress: ["new", "assigned", "resolved"],
  resolved: ["new", "assigned", "in_progress"],
};

// Middleware to verify JWT
function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");
    if (!token) return res.status(401).json({ error: "missing token" });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

// Middleware to check staff role
function requireStaff(req, res, next) {
  if (req.user.role !== "staff" && req.user.role !== "admin") {
    return res.status(403).json({ error: "requires staff or admin role" });
  }
  next();
}

// Helper: Send Notification to S6 Service
async function sendNotification(authToken, userId, ticketId, message) {
  try {
    // We use fetch (native in Node 18+)
    await fetch(`${NOTIFICATION_SERVICE_URL}/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken, // Pass the staff's token to authorize the request
      },
      body: JSON.stringify({
        user_id: userId,
        ticket_id: ticketId,
        type: "ticket_status_changed",
        channel: "in_app",
        message: message,
      }),
    });
    console.log(`Notification sent for Ticket #${ticketId}`);
  } catch (error) {
    // We log the error but don't stop the workflow if notification fails
    console.error("Failed to send notification:", error.message);
  }
}

async function init() {
  try {
    await pool.query(`
      ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium',
      ADD COLUMN IF NOT EXISTS assigned_to INTEGER,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_history (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL,
        changed_by INTEGER NOT NULL,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("Workflow tables ready");
  } catch (err) {
    console.log("Error initializing tables", err);
  }
}

async function logChange(ticketId, userId, fieldName, oldValue, newValue) {
  await pool.query(
    `INSERT INTO ticket_history (ticket_id, changed_by, field_name, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticketId, userId, fieldName, oldValue, newValue],
  );
}

// PATCH /priority/:id
app.patch("/priority/:id", authenticate, requireStaff, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { priority } = req.body;

    if (isNaN(ticketId))
      return res.status(400).json({ error: "invalid ticket id" });
    if (!priority || !VALID_PRIORITIES.includes(priority.toLowerCase())) {
      return res
        .status(400)
        .json({ error: `priority must be: ${VALID_PRIORITIES.join(", ")}` });
    }

    const current = await pool.query(
      "SELECT priority FROM tickets WHERE id = $1",
      [ticketId],
    );
    if (current.rows.length === 0)
      return res.status(404).json({ error: "ticket not found" });

    const oldPriority = current.rows[0].priority;

    const result = await pool.query(
      `UPDATE tickets SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [priority.toLowerCase(), ticketId],
    );

    await logChange(
      ticketId,
      req.user.sub,
      "priority",
      oldPriority,
      priority.toLowerCase(),
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// PATCH /status/:id - Update status AND Notify
app.patch("/status/:id", authenticate, requireStaff, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(ticketId))
      return res.status(400).json({ error: "invalid ticket id" });
    if (!status || !VALID_STATUSES.includes(status.toLowerCase())) {
      return res
        .status(400)
        .json({ error: `status must be: ${VALID_STATUSES.join(", ")}` });
    }

    // --- CHANGE 1: Fetch user_id and title to use in notification ---
    const current = await pool.query(
      "SELECT status, user_id, title FROM tickets WHERE id = $1",
      [ticketId],
    );

    if (current.rows.length === 0)
      return res.status(404).json({ error: "ticket not found" });

    const currentStatus = current.rows[0].status.toLowerCase();
    const ticketOwnerId = current.rows[0].user_id; // For notification
    const ticketTitle = current.rows[0].title; // For notification

    const newStatus = status.toLowerCase();

    // Validation
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      return res.status(400).json({
        error: `cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowedTransitions.join(", ")}`,
      });
    }

    const result = await pool.query(
      `UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newStatus, ticketId],
    );

    await logChange(ticketId, req.user.sub, "status", currentStatus, newStatus);

    // --- CHANGE 2: Send Notification ---
    if (currentStatus !== newStatus) {
      await sendNotification(
        req.headers.authorization, // Pass auth token
        ticketOwnerId, // Notify the user who owns the ticket
        ticketId,
        `Your ticket '${ticketTitle}' status has been updated to '${newStatus}'`,
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// PATCH /assign/:id
app.patch("/assign/:id", authenticate, requireStaff, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { assigned_to } = req.body;

    if (isNaN(ticketId))
      return res.status(400).json({ error: "invalid ticket id" });

    // Fetch details for notification
    const current = await pool.query(
      "SELECT status, assigned_to, user_id, title FROM tickets WHERE id = $1",
      [ticketId],
    );

    if (current.rows.length === 0)
      return res.status(404).json({ error: "ticket not found" });

    const oldAssignedTo = current.rows[0].assigned_to;
    const currentStatus = current.rows[0].status.toLowerCase();
    const ticketOwnerId = current.rows[0].user_id;
    const ticketTitle = current.rows[0].title;

    let newStatus = currentStatus;
    if (currentStatus === "new" && assigned_to) {
      newStatus = "assigned";
    }

    const result = await pool.query(
      `UPDATE tickets SET assigned_to = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [assigned_to || null, newStatus, ticketId],
    );

    await logChange(
      ticketId,
      req.user.sub,
      "assigned_to",
      oldAssignedTo ? oldAssignedTo.toString() : null,
      assigned_to ? assigned_to.toString() : null,
    );

    if (newStatus !== currentStatus) {
      await logChange(
        ticketId,
        req.user.sub,
        "status",
        currentStatus,
        newStatus,
      );

      // Notify on implicit status change (e.g., New -> Assigned)
      await sendNotification(
        req.headers.authorization,
        ticketOwnerId,
        ticketId,
        `Your ticket '${ticketTitle}' is now being processed (Assigned)`,
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /history/:id
app.get("/history/:id", authenticate, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    if (isNaN(ticketId))
      return res.status(400).json({ error: "invalid ticket id" });

    let accessCheck;
    if (req.user.role === "staff" || req.user.role === "admin") {
      accessCheck = await pool.query("SELECT id FROM tickets WHERE id = $1", [
        ticketId,
      ]);
    } else {
      accessCheck = await pool.query(
        "SELECT id FROM tickets WHERE id = $1 AND user_id = $2",
        [ticketId, req.user.sub],
      );
    }

    if (accessCheck.rows.length === 0)
      return res.status(404).json({ error: "ticket not found" });

    const result = await pool.query(
      `SELECT id, ticket_id, changed_by, field_name, old_value, new_value, changed_at FROM ticket_history WHERE ticket_id = $1 ORDER BY changed_at DESC`,
      [ticketId],
    );

    res.json({ history: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /queue
app.get("/queue", authenticate, requireStaff, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, user_id, title, description, category, status, priority, assigned_to, created_at
      FROM tickets WHERE status != 'resolved'
      ORDER BY
        CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
        created_at ASC
    `);
    res.json({ queue: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// POST /auto-priority/:id
app.post("/auto-priority/:id", authenticate, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { category } = req.body;
    if (isNaN(ticketId))
      return res.status(400).json({ error: "invalid ticket id" });

    const CATEGORY_PRIORITY_MAP = {
      bug: "high",
      feature: "medium",
      support: "medium",
      other: "low",
    };
    const priority = CATEGORY_PRIORITY_MAP[category] || "medium";

    await pool.query(
      `UPDATE tickets SET priority = $1, updated_at = NOW() WHERE id = $2`,
      [priority, ticketId],
    );
    res.json({ ticketId, priority });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

app.get("/health", (req, res) =>
  res.json({ status: "ok", service: "s4-workflow" }),
);

const PORT = process.env.PORT || 3004;
const registerService = require("./register-helper");

init().then(() => {
  app.listen(PORT, async () => {
    console.log(`S4 Workflow service running on port ${PORT}`);
    await registerService("s4-workflow", "s4-workflow", PORT, "/health");
  });
});
