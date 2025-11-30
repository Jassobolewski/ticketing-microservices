const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// In-memory notification queue
const notificationQueue = [];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds

// Notification types
const NOTIFICATION_TYPES = {
  TICKET_CREATED: "ticket_created",
  TICKET_ASSIGNED: "ticket_assigned",
  TICKET_STATUS_CHANGED: "ticket_status_changed",
  TICKET_CLOSED: "ticket_closed",
  TEST_ALERT: "test_alert",
};

// Notification channels
const CHANNELS = {
  EMAIL: "email",
  SMS: "sms",
  IN_APP: "in_app",
};

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

// Initialize notifications table on startup
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      ticket_id INTEGER,
      type TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      message TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMP
    );
  `);

  // Create index on user_id for faster lookups
  await pool
    .query(
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`,
    )
    .catch(() => {
      // Index might already exist, ignore error
    });

  console.log("Notifications table ready");
}

// Simulated email sender (replace with real email service)
async function sendEmail(to, subject, body) {
  return new Promise((resolve, reject) => {
    // Simulate network delay
    setTimeout(() => {
      // Simulate 90% success rate
      if (Math.random() > 0.1) {
        console.log(`[EMAIL SENT] To: ${to}, Subject: ${subject}`);
        console.log(`[EMAIL BODY] ${body}`);
        resolve({ success: true });
      } else {
        console.error(`[EMAIL FAILED] To: ${to}, Subject: ${subject}`);
        reject(new Error("Email delivery failed"));
      }
    }, 1000);
  });
}

// Simulated SMS sender (replace with real SMS service)
async function sendSMS(to, message) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() > 0.1) {
        console.log(`[SMS SENT] To: ${to}, Message: ${message}`);
        resolve({ success: true });
      } else {
        console.error(`[SMS FAILED] To: ${to}`);
        reject(new Error("SMS delivery failed"));
      }
    }, 500);
  });
}

// Process a notification based on channel
async function processNotification(notification) {
  const { channel, message, user_email, user_id, type, ticket_id } =
    notification;

  try {
    switch (channel) {
      case CHANNELS.EMAIL:
        await sendEmail(
          user_email || `user${user_id}@example.com`,
          `Ticket Notification: ${type}`,
          message,
        );
        break;

      case CHANNELS.SMS:
        await sendSMS(`+1-555-${user_id}`, message);
        break;

      case CHANNELS.IN_APP:
        // In-app notifications just get stored in database
        console.log(`[IN-APP NOTIFICATION] User ${user_id}: ${message}`);
        break;

      default:
        throw new Error(`Unknown channel: ${channel}`);
    }

    // Mark as sent in database
    await pool.query(
      `UPDATE notifications
       SET status = 'sent', sent_at = NOW()
       WHERE id = $1`,
      [notification.db_id],
    );

    console.log(
      `[Notification] Successfully sent notification ${notification.db_id}`,
    );
    return true;
  } catch (error) {
    console.error(
      `[Notification] Failed to send notification ${notification.db_id}:`,
      error.message,
    );

    // Update retry count
    await pool.query(
      `UPDATE notifications
       SET retry_count = retry_count + 1
       WHERE id = $1`,
      [notification.db_id],
    );

    return false;
  }
}

// Queue processor (runs in background)
async function processQueue() {
  while (notificationQueue.length > 0) {
    const notification = notificationQueue.shift();

    const success = await processNotification(notification);

    if (!success && notification.retry_count < MAX_RETRIES) {
      // Re-queue with delay
      setTimeout(() => {
        notification.retry_count += 1;
        console.log(
          `[Queue] Retrying notification ${notification.db_id} (attempt ${notification.retry_count}/${MAX_RETRIES})`,
        );
        notificationQueue.push(notification);
      }, RETRY_DELAY_MS);
    } else if (!success) {
      // Mark as failed after max retries
      await pool.query(
        `UPDATE notifications
         SET status = 'failed'
         WHERE id = $1`,
        [notification.db_id],
      );
      console.error(
        `[Queue] Notification ${notification.db_id} failed after ${MAX_RETRIES} retries`,
      );
    }
  }

  // Check again after a short delay
  setTimeout(processQueue, 1000);
}

// Health check endpoint (MUST come before /:id)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "s6-notifications",
    queue_length: notificationQueue.length,
  });
});

// POST /notify - Send a notification
app.post("/notify", authenticate, async (req, res) => {
  try {
    const { user_id, ticket_id, type, channel, message, user_email } = req.body;

    // Validate required fields
    if (!user_id || !type || !channel || !message) {
      return res.status(400).json({
        error: "user_id, type, channel, and message are required",
      });
    }

    // Validate type
    if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${Object.values(NOTIFICATION_TYPES).join(", ")}`,
      });
    }

    // Validate channel
    if (!Object.values(CHANNELS).includes(channel)) {
      return res.status(400).json({
        error: `channel must be one of: ${Object.values(CHANNELS).join(", ")}`,
      });
    }

    // Store notification in database
    const result = await pool.query(
      `INSERT INTO notifications (user_id, ticket_id, type, channel, message, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, user_id, ticket_id, type, channel, message, status, retry_count, created_at`,
      [user_id, ticket_id || null, type, channel, message],
    );

    const notification = result.rows[0];

    // Add to queue for processing
    notificationQueue.push({
      db_id: notification.id,
      user_id: notification.user_id,
      ticket_id: notification.ticket_id,
      type: notification.type,
      channel: notification.channel,
      message: notification.message,
      user_email: user_email,
      retry_count: 0,
    });

    console.log(
      `[Queue] Added notification ${notification.id} to queue (${notificationQueue.length} in queue)`,
    );

    res.status(201).json(notification);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /history/:userId - Get notification history for a user
app.get("/history/:userId", authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ error: "invalid user id" });
    }

    // Staff can view any user's history, regular users only their own
    const isStaff = req.user.role === "staff" || req.user.role === "admin";

    if (!isStaff && req.user.sub !== userId) {
      return res.status(403).json({ error: "permission denied" });
    }

    const result = await pool.query(
      `SELECT id, user_id, ticket_id, type, channel, status, message, retry_count, created_at, sent_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId],
    );

    res.json({ notifications: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /queue - Get current queue status (staff only)
app.get("/queue", authenticate, async (req, res) => {
  try {
    const isStaff = req.user.role === "staff" || req.user.role === "admin";

    if (!isStaff) {
      return res.status(403).json({ error: "permission denied" });
    }

    // Get pending notifications
    const result = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM notifications
       GROUP BY status
       ORDER BY status`,
    );

    res.json({
      queue_length: notificationQueue.length,
      stats: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

const PORT = process.env.PORT || 3006;
const registerService = require("./register-helper");

init().then(() => {
  app.listen(PORT, async () => {
    console.log(`S6 Notifications service running on port ${PORT}`);

    // Start queue processor
    processQueue();

    // Register with service registry
    await registerService(
      "s6-notifications",
      "s6-notifications",
      PORT,
      "/health",
    );
  });
});
