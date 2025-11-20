const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const app = express();

// CORS (dev-simple)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Auth service proxy
app.use(
  "/auth",
  createProxyMiddleware({
    target: "http://s1-auth-account:3001",
    changeOrigin: true,
    pathRewrite: { "^/auth": "" },
  }),
);

// Ticket intake service proxy
app.use(
  "/tickets",
  createProxyMiddleware({
    target: "http://s2-ticket-intake:3002",
    changeOrigin: true,
    pathRewrite: { "^/tickets": "" },
  }),
);

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
