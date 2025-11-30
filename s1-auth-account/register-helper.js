/**
 * Service Registration Helper
 *
 * Copy this file to other services and use it to self-register with the registry.
 *
 * Usage:
 *   const registerService = require('./register-helper');
 *   registerService('my-service', 'my-service', 3001);
 */

const http = require('http');

/**
 * Register a service with the registry
 * @param {string} serviceName - Name of the service (e.g., 's1-auth', 's2-tickets')
 * @param {string} host - Hostname (usually the container name)
 * @param {number} port - Port the service listens on
 * @param {string} healthEndpoint - Health check endpoint (default: '/health')
 * @param {string} registryUrl - Registry URL (from env or default)
 */
async function registerService(
  serviceName,
  host,
  port,
  healthEndpoint = '/health',
  registryUrl = process.env.REGISTRY_URL || 'http://s3-registry:3003'
) {
  const registrationData = JSON.stringify({
    name: serviceName,
    host: host,
    port: port,
    healthEndpoint: healthEndpoint,
  });

  const url = new URL('/register', registryUrl);

  const options = {
    hostname: url.hostname,
    port: url.port || 3003,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(registrationData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[Registry] Successfully registered ${serviceName}`);
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ success: true });
          }
        } else {
          console.error(`[Registry] Registration failed (${res.statusCode}):`, data);
          reject(new Error(`Registration failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error(`[Registry] Registration error for ${serviceName}:`, error.message);
      // Don't reject - service should continue even if registration fails
      resolve({ success: false, error: error.message });
    });

    req.write(registrationData);
    req.end();
  });
}

/**
 * Register with retry logic
 */
async function registerWithRetry(serviceName, host, port, healthEndpoint, maxRetries = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Registry] Registration attempt ${attempt}/${maxRetries} for ${serviceName}...`);
      const result = await registerService(serviceName, host, port, healthEndpoint);

      if (result.success !== false) {
        return result;
      }

      if (attempt < maxRetries) {
        console.log(`[Registry] Retrying in ${delayMs/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`[Registry] Attempt ${attempt} failed:`, error.message);

      if (attempt < maxRetries) {
        console.log(`[Registry] Retrying in ${delayMs/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.warn(`[Registry] Failed to register ${serviceName} after ${maxRetries} attempts. Service will continue without registration.`);
  return { success: false };
}

module.exports = registerWithRetry;
