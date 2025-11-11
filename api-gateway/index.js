const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// Forward /auth/* to auth service
app.use(
  "/auth",
  createProxyMiddleware({
    target: "http://s1-auth-account:3001",
    changeOrigin: true,
    pathRewrite: { "^/auth": "" }
  })
);

// Healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});

