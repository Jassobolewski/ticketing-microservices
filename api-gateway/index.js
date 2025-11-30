const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const axios = require("axios");

const app = express();

const REGISTRY_URL = process.env.REGISTRY_URL || "http://s3-registry:3003";

// Service URL cache to avoid hitting registry for every request
const serviceCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

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

/**
 * Discover service from registry with caching
 */
async function discoverService(serviceName) {
  // Check cache first
  const cached = serviceCache.get(serviceName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.url;
  }

  try {
    const response = await axios.get(
      `${REGISTRY_URL}/discover/${serviceName}`,
      { timeout: 5000 }
    );

    if (response.data && response.data.url) {
      // Update cache
      serviceCache.set(serviceName, {
        url: response.data.url,
        timestamp: Date.now(),
      });

      console.log(`[Registry] Discovered ${serviceName} at ${response.data.url}`);
      return response.data.url;
    }

    throw new Error(`Service ${serviceName} not found in registry`);
  } catch (error) {
    console.error(`[Registry] Failed to discover ${serviceName}:`, error.message);

    // Fallback to hardcoded URLs if registry is unavailable
    const fallbackUrls = {
      "s1-auth": "http://s1-auth-account:3001",
      "s2-tickets": "http://s2-ticket-intake:3002",
      "s4-workflow": "http://s4-workflow:3004",
      "s5-media": "http://s5-media:3005",
      "s6-notifications": "http://s6-notifications:3006",
      "s7-analytics": "http://s7-analytics:3007",
      "s8-feedback": "http://s8-feedback:3008",
    };

    if (fallbackUrls[serviceName]) {
      console.warn(`[Registry] Using fallback URL for ${serviceName}`);
      return fallbackUrls[serviceName];
    }

    throw error;
  }
}

/**
 * Dynamic proxy middleware that discovers service URLs from registry
 */
function createDynamicProxy(serviceName, pathPrefix) {
  return async (req, res, next) => {
    try {
      const serviceUrl = await discoverService(serviceName);

      // Create proxy middleware on the fly
      const proxy = createProxyMiddleware({
        target: serviceUrl,
        changeOrigin: true,
        pathRewrite: { [`^${pathPrefix}`]: "" },
        logLevel: "debug",
        onProxyReq: (proxyReq, req, res) => {
          console.log(`[Proxy] ${req.method} ${req.url} -> ${serviceUrl}`);
        },
        onProxyRes: (proxyRes, req, res) => {
          console.log(`[Proxy Response] ${proxyRes.statusCode} from ${serviceUrl}`);
        },
        onError: (err, req, res) => {
          console.error("[Proxy Error]", err.message);
          // Clear cache on error
          serviceCache.delete(serviceName);
          res.status(502).json({ error: "Bad Gateway", details: err.message });
        },
      });

      proxy(req, res, next);
    } catch (error) {
      console.error(`[Gateway] Service discovery failed for ${serviceName}:`, error.message);
      res.status(503).json({
        error: "Service Unavailable",
        message: `Could not discover ${serviceName}`,
      });
    }
  };
}

// Dynamic service proxies using registry discovery
app.use("/auth", createDynamicProxy("s1-auth", "/auth"));
app.use("/tickets", createDynamicProxy("s2-tickets", "/tickets"));
app.use("/workflow", createDynamicProxy("s4-workflow", "/workflow"));
app.use("/media", createDynamicProxy("s5-media", "/media"));
app.use("/notifications", createDynamicProxy("s6-notifications", "/notifications"));
app.use("/analytics", createDynamicProxy("s7-analytics", "/analytics"));
app.use("/feedback", createDynamicProxy("s8-feedback", "/feedback"));

// Endpoint to list all available services (for debugging)
app.get("/registry/services", async (req, res) => {
  try {
    const response = await axios.get(`${REGISTRY_URL}/services`, {
      timeout: 5000,
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch services from registry",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Using service registry at ${REGISTRY_URL}`);
  console.log(`Service cache TTL: ${CACHE_TTL / 1000}s`);
});
