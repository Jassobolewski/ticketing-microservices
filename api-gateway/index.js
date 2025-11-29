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

// Health check BEFORE proxies
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Common proxy options
const createProxy = (target, pathPrefix) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { [`^${pathPrefix}`]: "" },
    logLevel: "debug",
    onProxyReq: (proxyReq, req, res) => {
      console.log(`[Proxy] ${req.method} ${req.url} -> ${target}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(`[Proxy Response] ${proxyRes.statusCode} from ${target}`);
    },
    onError: (err, req, res) => {
      console.error("[Proxy Error]", err.message);
      res.status(502).json({ error: "Bad Gateway", details: err.message });
    },
  });
};

// Auth service proxy
app.use("/auth", createProxy("http://s1-auth-account:3001", "/auth"));

// Ticket intake service proxy
app.use("/tickets", createProxy("http://s2-ticket-intake:3002", "/tickets"));

// Workflow service proxy
app.use("/workflow", createProxy("http://s4-workflow:3004", "/workflow"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
