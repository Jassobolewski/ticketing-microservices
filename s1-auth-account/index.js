const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Ensure table exists (dev/demo only)
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user'
    );
  `);
  console.log("Users table ready");
}

app.post("/register", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role",
      [email, hash, role || "user"]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "email already registered" });
    }
    res.status(500).json({ error: "internal error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "email and password are required" });

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// simple whoami endpoint for testing JWT
app.get("/me", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");
    if (!token) return res.status(401).json({ error: "missing token" });

    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ user: payload });
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "s1-auth" });
});

const PORT = process.env.PORT || 3001;
const registerService = require('./register-helper');

init().then(() => {
  app.listen(PORT, async () => {
    console.log(`Auth service running on port ${PORT}`);

    // Register with service registry
    await registerService('s1-auth', 's1-auth-account', PORT, '/health');
  });
});

