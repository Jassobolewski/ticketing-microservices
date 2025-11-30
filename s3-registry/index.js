const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// In-memory service registry
// Structure: { serviceName: { host, port, healthEndpoint, lastHealthCheck, status, registeredAt } }
const services = new Map();

// Health check configuration
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const MAX_FAILED_CHECKS = 3; // Remove service after 3 failed checks

// Track failed health checks
const failedChecks = new Map();

/**
 * POST /register - Register a service
 * Body: { name, host, port, healthEndpoint }
 */
app.post("/register", (req, res) => {
  try {
    const { name, host, port, healthEndpoint } = req.body;

    if (!name || !host || !port) {
      return res.status(400).json({
        error: "name, host, and port are required",
      });
    }

    const serviceInfo = {
      name,
      host,
      port,
      healthEndpoint: healthEndpoint || "/health",
      lastHealthCheck: null,
      status: "healthy",
      registeredAt: new Date().toISOString(),
      url: `http://${host}:${port}`,
    };

    services.set(name, serviceInfo);
    failedChecks.set(name, 0);

    console.log(`[Registry] Service registered: ${name} at ${serviceInfo.url}`);

    res.status(201).json({
      message: "Service registered successfully",
      service: serviceInfo,
    });
  } catch (err) {
    console.error("[Registry] Registration error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

/**
 * DELETE /deregister/:name - Deregister a service
 */
app.delete("/deregister/:name", (req, res) => {
  try {
    const { name } = req.params;

    if (!services.has(name)) {
      return res.status(404).json({ error: "service not found" });
    }

    services.delete(name);
    failedChecks.delete(name);

    console.log(`[Registry] Service deregistered: ${name}`);

    res.json({ message: "Service deregistered successfully" });
  } catch (err) {
    console.error("[Registry] Deregistration error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

/**
 * GET /services - List all registered services
 */
app.get("/services", (req, res) => {
  try {
    const serviceList = Array.from(services.values());

    res.json({
      count: serviceList.length,
      services: serviceList,
    });
  } catch (err) {
    console.error("[Registry] List services error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

/**
 * GET /services/:name - Get specific service information
 */
app.get("/services/:name", (req, res) => {
  try {
    const { name } = req.params;

    if (!services.has(name)) {
      return res.status(404).json({ error: "service not found" });
    }

    res.json(services.get(name));
  } catch (err) {
    console.error("[Registry] Get service error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

/**
 * GET /health/:name - Check health of a specific service
 */
app.get("/health/:name", async (req, res) => {
  try {
    const { name } = req.params;

    if (!services.has(name)) {
      return res.status(404).json({ error: "service not found" });
    }

    const service = services.get(name);
    const healthStatus = await checkServiceHealth(service);

    res.json({
      service: name,
      status: healthStatus.healthy ? "healthy" : "unhealthy",
      lastCheck: healthStatus.checkedAt,
      details: healthStatus.details,
    });
  } catch (err) {
    console.error("[Registry] Health check error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

/**
 * GET /discover/:name - Discover service endpoint (alias for GET /services/:name)
 */
app.get("/discover/:name", (req, res) => {
  try {
    const { name } = req.params;

    if (!services.has(name)) {
      return res.status(404).json({
        error: "service not found",
        message: `Service '${name}' is not registered`,
      });
    }

    const service = services.get(name);

    if (service.status !== "healthy") {
      return res.status(503).json({
        error: "service unhealthy",
        message: `Service '${name}' is registered but unhealthy`,
        service,
      });
    }

    res.json({
      name: service.name,
      url: service.url,
      host: service.host,
      port: service.port,
      status: service.status,
    });
  } catch (err) {
    console.error("[Registry] Discover error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

/**
 * GET /health - Registry service health check
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    registeredServices: services.size,
    uptime: process.uptime(),
  });
});

/**
 * Check health of a single service
 */
async function checkServiceHealth(service) {
  const healthUrl = `${service.url}${service.healthEndpoint}`;

  try {
    const response = await axios.get(healthUrl, {
      timeout: HEALTH_CHECK_TIMEOUT,
      validateStatus: (status) => status === 200,
    });

    return {
      healthy: true,
      checkedAt: new Date().toISOString(),
      details: response.data,
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      details: err.message,
    };
  }
}

/**
 * Periodic health check for all registered services
 */
async function performHealthChecks() {
  console.log(`[Registry] Performing health checks on ${services.size} services...`);

  for (const [name, service] of services.entries()) {
    const healthStatus = await checkServiceHealth(service);

    service.lastHealthCheck = healthStatus.checkedAt;

    if (healthStatus.healthy) {
      // Service is healthy, reset failed check counter
      service.status = "healthy";
      failedChecks.set(name, 0);
      console.log(`[Registry] ✓ ${name} is healthy`);
    } else {
      // Service is unhealthy, increment failed check counter
      const currentFailures = failedChecks.get(name) || 0;
      const newFailures = currentFailures + 1;
      failedChecks.set(name, newFailures);

      service.status = "unhealthy";
      console.log(
        `[Registry] ✗ ${name} is unhealthy (${newFailures}/${MAX_FAILED_CHECKS} failures)`
      );

      // Remove service if it has exceeded max failed checks
      if (newFailures >= MAX_FAILED_CHECKS) {
        console.log(
          `[Registry] Removing ${name} from registry (exceeded max failed checks)`
        );
        services.delete(name);
        failedChecks.delete(name);
      }
    }
  }
}

// Start periodic health checks
setInterval(performHealthChecks, HEALTH_CHECK_INTERVAL);

const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
  console.log(`S3 Registry service running on port ${PORT}`);
  console.log(`Health check interval: ${HEALTH_CHECK_INTERVAL / 1000}s`);
  console.log(`Max failed checks before removal: ${MAX_FAILED_CHECKS}`);
});
