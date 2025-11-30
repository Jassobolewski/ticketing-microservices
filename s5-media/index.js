const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// File upload configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${uniqueSuffix}-${basename}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
        ),
      );
    }
  },
});

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

// Initialize media_files table on startup
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_files (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL,
      uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Create index on ticket_id for faster lookups
  await pool
    .query(
      `CREATE INDEX IF NOT EXISTS idx_media_files_ticket_id ON media_files(ticket_id);`,
    )
    .catch(() => {
      // Index might already exist, ignore error
    });

  console.log("Media files table ready");
}

// Health check endpoint (MUST come before /:id)
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "s5-media" });
});

// POST /upload - Upload a file for a ticket
app.post("/upload", authenticate, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "no file uploaded" });
    }

    const { ticket_id } = req.body;

    if (!ticket_id) {
      // Clean up uploaded file if ticket_id is missing
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "ticket_id is required" });
    }

    const ticketId = parseInt(ticket_id);
    if (isNaN(ticketId)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "invalid ticket_id" });
    }

    // Store file metadata in database
    const result = await pool.query(
      `INSERT INTO media_files (ticket_id, filename, original_filename, mime_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, ticket_id, filename, original_filename, mime_type, file_size, uploaded_by, uploaded_at`,
      [
        ticketId,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.user.sub,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    // Clean up file if database insert fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: "internal error" });
  }
});

// GET /ticket/:ticketId - List all files for a ticket
app.get("/ticket/:ticketId", authenticate, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.ticketId);

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: "invalid ticket id" });
    }

    const result = await pool.query(
      `SELECT id, ticket_id, original_filename, mime_type, file_size, uploaded_by, uploaded_at
       FROM media_files
       WHERE ticket_id = $1
       ORDER BY uploaded_at DESC`,
      [ticketId],
    );

    res.json({ files: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// GET /:id - Download a file
app.get("/:id", authenticate, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);

    if (isNaN(fileId)) {
      return res.status(400).json({ error: "invalid file id" });
    }

    const result = await pool.query(
      `SELECT id, ticket_id, filename, original_filename, mime_type
       FROM media_files
       WHERE id = $1`,
      [fileId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "file not found" });
    }

    const fileRecord = result.rows[0];
    const filePath = path.join(UPLOAD_DIR, fileRecord.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "file not found on disk" });
    }

    // Set appropriate headers for file download
    res.setHeader("Content-Type", fileRecord.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileRecord.original_filename}"`,
    );

    // Stream file to response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// DELETE /:id - Delete a file (staff only or file owner)
app.delete("/:id", authenticate, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);

    if (isNaN(fileId)) {
      return res.status(400).json({ error: "invalid file id" });
    }

    const isStaff = req.user.role === "staff" || req.user.role === "admin";

    // Get file info
    const fileResult = await pool.query(
      `SELECT id, filename, uploaded_by
       FROM media_files
       WHERE id = $1`,
      [fileId],
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: "file not found" });
    }

    const fileRecord = fileResult.rows[0];

    // Check permission: staff or file owner
    if (!isStaff && fileRecord.uploaded_by !== req.user.sub) {
      return res.status(403).json({ error: "permission denied" });
    }

    // Delete from database
    await pool.query(`DELETE FROM media_files WHERE id = $1`, [fileId]);

    // Delete file from disk
    const filePath = path.join(UPLOAD_DIR, fileRecord.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: "file deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

const PORT = process.env.PORT || 3005;
const registerService = require("./register-helper");

init().then(() => {
  app.listen(PORT, async () => {
    console.log(`S5 Media service running on port ${PORT}`);

    // Register with service registry
    await registerService("s5-media", "s5-media", PORT, "/health");
  });
});
