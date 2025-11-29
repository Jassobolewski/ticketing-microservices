# CLAUDE.md - AI Assistant Guide for Ticketing Microservices

## Project Overview

This is a **microservices-based ticketing system** built with Node.js, Express, PostgreSQL, and Docker. The system demonstrates a modern microservices architecture with:

- **API Gateway** pattern for unified entry point
- **Service isolation** with independent microservices
- **JWT-based authentication** for secure access
- **Containerized deployment** via Docker Compose
- **Svelte frontend** for modern web UI

**Primary Purpose:** Demonstrate a production-ready microservices architecture for a ticketing/support system that can be deployed locally or to the cloud.

---

## Codebase Structure

```
ticketing-microservices/
├── api-gateway/              # API Gateway (Port 8080)
│   ├── index.js              # Express proxy server with CORS
│   ├── package.json          # Dependencies: express, http-proxy-middleware
│   └── Dockerfile            # Node 20 Alpine container
│
├── s1-auth-account/          # Service 1: Authentication & User Management
│   ├── index.js              # Auth endpoints: /register, /login, /me
│   ├── package.json          # Dependencies: express, bcryptjs, jsonwebtoken, pg
│   └── Dockerfile            # Node 20 Alpine container
│
├── s2-ticket-intake/         # Service 2: Ticket Management
│   ├── index.js              # Ticket CRUD endpoints
│   ├── package.json          # Dependencies: express, jsonwebtoken, pg
│   └── Dockerfile            # Node 20 Alpine container
│
├── webclient/                # Frontend: Svelte SPA
│   ├── src/
│   │   ├── App.svelte        # Main app component with auth & ticket UI
│   │   ├── main.js           # Entry point
│   │   └── app.css           # Global styles
│   ├── package.json          # Dependencies: svelte, vite
│   ├── vite.config.js        # Vite build configuration
│   └── index.html            # HTML entry point
│
├── infra/
│   └── docker-compose.yml    # Orchestration: Postgres + 3 services
│
└── README.md                 # User-facing documentation
```

---

## Technology Stack

### Backend Services
- **Runtime:** Node.js 20 (Alpine Linux containers)
- **Framework:** Express 4.x/5.x
- **Database:** PostgreSQL 16 (Alpine)
- **Authentication:** JWT (jsonwebtoken ^9.0.2)
- **Password Hashing:** bcryptjs ^3.0.3
- **Database Client:** pg (node-postgres) ^8.11+
- **Proxy:** http-proxy-middleware ^3.0.5

### Frontend
- **Framework:** Svelte 5.x
- **Build Tool:** Vite 7.x
- **State Management:** Svelte stores + localStorage

### Infrastructure
- **Containerization:** Docker
- **Orchestration:** Docker Compose 3.9
- **Network:** Internal Docker network + exposed ports

---

## Architecture & Service Communication

### Network Flow

```
Client (Browser)
    ↓ HTTP (localhost:8080)
API Gateway (api-gateway:8080)
    ↓
    ├─→ /auth/*     → S1 Auth (s1-auth-account:3001)
    ├─→ /tickets/*  → S2 Tickets (s2-ticket-intake:3002)
    └─→ /health     → Gateway health check
```

### Service Details

#### API Gateway (Port 8080)
- **External Port:** 8080
- **Purpose:** Single public entry point, CORS handling, request routing
- **CORS:** Configured for `http://localhost:5173` (Vite dev server)
- **Routing:**
  - `/auth/*` → Proxies to S1 with path rewrite (strips `/auth`)
  - `/tickets/*` → Proxies to S2 with path rewrite (strips `/tickets`)
  - `/health` → Returns `{"status": "ok"}`

#### S1: Auth Service (Port 3001)
- **Internal URL:** `http://s1-auth-account:3001`
- **Database:** Shares Postgres with S2
- **Table:** `users` (id, email, password_hash, role)
- **Endpoints:**
  - `POST /register` - Create new user account
  - `POST /login` - Authenticate and receive JWT
  - `GET /me` - Get current user info (requires JWT)

#### S2: Ticket Intake (Port 3002)
- **Internal URL:** `http://s2-ticket-intake:3002`
- **Database:** Shares Postgres with S1
- **Table:** `tickets` (id, user_id, title, description, category, status, created_at)
- **Endpoints:**
  - `POST /` - Create ticket (auth required)
  - `GET /` - List user's tickets (auth required)
  - `GET /:id` - Get specific ticket (auth required, owner only)

### Database Connection
- **Connection String:** `postgres://ticketuser:ticketpass@postgres:5432/ticketdb`
- **Environment Variable:** `DB_URL`
- **Shared Database:** All services connect to the same Postgres instance
- **Schema Management:** Each service creates its own tables on startup (development pattern)

---

## Database Schema

### Users Table (S1)
```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);
```

### Tickets Table (S2)
```sql
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,          -- References users.id (no FK constraint)
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,            -- 'bug', 'feature', 'support', 'other'
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Note:** No formal foreign key constraints exist between `tickets.user_id` and `users.id`. This is a common microservices pattern where services maintain logical relationships without DB-level constraints.

---

## Authentication & Security

### JWT Flow
1. User registers via `POST /auth/register` (password hashed with bcrypt)
2. User logs in via `POST /auth/login` (returns JWT token)
3. Client stores token in localStorage
4. Client includes token in requests: `Authorization: Bearer <token>`
5. Services verify token using shared `JWT_SECRET`

### JWT Payload Structure
```javascript
{
  sub: userId,      // Subject: user ID
  role: "user",     // User role
  email: "user@example.com",
  exp: <timestamp>  // Expires in 1 hour
}
```

### Security Configuration
- **JWT Secret:** `JWT_SECRET` env var (default: "dev-secret" - CHANGE IN PRODUCTION)
- **Password Hashing:** bcrypt with 10 rounds
- **CORS:** Restricted to `http://localhost:5173` in development
- **Token Expiry:** 1 hour

### Authentication Middleware Pattern (S2)
```javascript
function authenticate(req, res, next) {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" ");
  if (!token) return res.status(401).json({ error: "missing token" });

  const payload = jwt.verify(token, JWT_SECRET);
  req.user = payload;  // Attach user info to request
  next();
}
```

---

## API Endpoints Reference

### Authentication Endpoints (via /auth/*)

#### POST /auth/register
**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "role": "user"  // Optional, defaults to "user"
}
```

**Response (201):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "role": "user"
}
```

**Errors:**
- `400` - Missing email/password
- `409` - Email already registered
- `500` - Internal error

#### POST /auth/login
**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:**
- `400` - Missing email/password
- `401` - Invalid credentials
- `500` - Internal error

#### GET /auth/me
**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "sub": 1,
    "role": "user",
    "email": "user@example.com"
  }
}
```

**Errors:**
- `401` - Missing or invalid token

### Ticket Endpoints (via /tickets/*)

#### POST /tickets
**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "title": "Application crashes on login",
  "description": "Detailed description of the issue...",
  "category": "bug"  // "bug", "feature", "support", or "other"
}
```

**Response (201):**
```json
{
  "id": 1,
  "user_id": 1,
  "title": "Application crashes on login",
  "description": "Detailed description...",
  "category": "bug",
  "status": "new",
  "created_at": "2025-11-29T12:00:00.000Z"
}
```

**Errors:**
- `400` - Missing required fields or invalid category
- `401` - Missing or invalid token
- `500` - Internal error

#### GET /tickets
**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "tickets": [
    {
      "id": 1,
      "user_id": 1,
      "title": "Application crashes on login",
      "description": "Detailed description...",
      "category": "bug",
      "status": "new",
      "created_at": "2025-11-29T12:00:00.000Z"
    }
  ]
}
```

**Note:** Only returns tickets owned by the authenticated user.

#### GET /tickets/:id
**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 1,
  "user_id": 1,
  "title": "Application crashes on login",
  "description": "Detailed description...",
  "category": "bug",
  "status": "new",
  "created_at": "2025-11-29T12:00:00.000Z"
}
```

**Errors:**
- `400` - Invalid ticket ID
- `401` - Missing or invalid token
- `404` - Ticket not found or not owned by user
- `500` - Internal error

---

## Development Workflows

### Local Development Setup

#### Prerequisites
- Docker Desktop installed and running
- Node.js 20+ (optional, for local development without containers)

#### Starting the Stack
```bash
cd infra
docker compose down          # Clean shutdown
docker compose up --build    # Build and start all services
```

**Services will be available at:**
- API Gateway: http://localhost:8080
- Frontend (if running separately): http://localhost:5173
- PostgreSQL: localhost:5432

#### Checking Service Health
```bash
curl http://localhost:8080/health
# Expected: {"status":"ok"}
```

#### Viewing Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f s1-auth-account
docker compose logs -f s2-ticket-intake
docker compose logs -f api-gateway
```

#### Stopping Services
```bash
# Graceful stop
docker compose down

# Stop and remove volumes (CLEARS DATABASE)
docker compose down -v
```

### Frontend Development

The webclient is a Svelte app that can be run independently:

```bash
cd webclient
npm install
npm run dev    # Starts Vite dev server on http://localhost:5173
```

**Frontend connects to:** `http://localhost:8080` (API Gateway)

### Making Code Changes

#### Backend Services
1. Modify code in service directory (e.g., `s1-auth-account/index.js`)
2. Rebuild and restart:
   ```bash
   cd infra
   docker compose up --build
   ```

#### Frontend
- Changes auto-reload with Vite HMR (if using `npm run dev`)
- For production build: `npm run build` (outputs to `dist/`)

---

## Key Conventions & Patterns

### Error Handling Pattern
All services use consistent error responses:
```javascript
res.status(400).json({ error: "descriptive error message" })
```

### Database Initialization
Each service creates its tables on startup using:
```javascript
async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ...`);
}
init().then(() => app.listen(PORT));
```

**Important:** This is a development pattern. Production systems should use proper migration tools.

### Environment Variables
Services expect these environment variables:

**S1 Auth:**
- `DB_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT signing
- `PORT` - Service port (default: 3001)

**S2 Tickets:**
- `DB_URL` - PostgreSQL connection string
- `JWT_SECRET` - Must match S1 for token verification
- `PORT` - Service port (default: 3002)

**API Gateway:**
- `PORT` - Gateway port (default: 8080)

### Code Style
- **CommonJS modules** (`require`/`module.exports`) for backend
- **ES modules** (`import`/`export`) for frontend
- **Async/await** for asynchronous operations
- **Arrow functions** preferred for callbacks
- **Destructuring** used for cleaner code

### Naming Conventions
- Services: `s<number>-<purpose>` (e.g., `s1-auth-account`)
- Database tables: lowercase plural (e.g., `users`, `tickets`)
- Environment variables: UPPERCASE_SNAKE_CASE
- JavaScript variables: camelCase

---

## Common Development Tasks

### Adding a New Microservice (S3)

1. **Create service directory:**
   ```bash
   mkdir s3-service-name
   cd s3-service-name
   ```

2. **Create package.json:**
   ```json
   {
     "name": "s3-service-name",
     "version": "1.0.0",
     "main": "index.js",
     "scripts": {
       "start": "node index.js"
     },
     "dependencies": {
       "express": "^5.1.0",
       "pg": "^8.16.3"
     }
   }
   ```

3. **Create index.js:**
   ```javascript
   const express = require("express");
   const { Pool } = require("pg");

   const app = express();
   app.use(express.json());

   const pool = new Pool({
     connectionString: process.env.DB_URL
   });

   // Your endpoints here

   const PORT = process.env.PORT || 3003;
   app.listen(PORT, () => console.log(`Service running on ${PORT}`));
   ```

4. **Create Dockerfile:**
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   EXPOSE 3003
   CMD ["npm", "start"]
   ```

5. **Add to docker-compose.yml:**
   ```yaml
   s3-service-name:
     build: ../s3-service-name
     container_name: s3-service-name
     environment:
       DB_URL: postgres://ticketuser:ticketpass@postgres:5432/ticketdb
       PORT: 3003
     depends_on:
       - postgres
   ```

6. **Add route to API Gateway:**
   ```javascript
   app.use(
     "/service-path",
     createProxyMiddleware({
       target: "http://s3-service-name:3003",
       changeOrigin: true,
       pathRewrite: { "^/service-path": "" }
     })
   );
   ```

### Adding a New Endpoint to Existing Service

**Example: Add PATCH /tickets/:id to update ticket status**

1. **Edit `s2-ticket-intake/index.js`:**
   ```javascript
   app.patch("/:id", authenticate, async (req, res) => {
     try {
       const ticketId = parseInt(req.params.id);
       const { status } = req.body;

       if (!status) {
         return res.status(400).json({ error: "status is required" });
       }

       const result = await pool.query(
         `UPDATE tickets
          SET status = $1
          WHERE id = $2 AND user_id = $3
          RETURNING *`,
         [status, ticketId, req.user.sub]
       );

       if (result.rows.length === 0) {
         return res.status(404).json({ error: "ticket not found" });
       }

       res.json(result.rows[0]);
     } catch (err) {
       console.error(err);
       res.status(500).json({ error: "internal error" });
     }
   });
   ```

2. **Rebuild and test:**
   ```bash
   cd infra
   docker compose up --build
   ```

### Adding Database Migrations

While this project uses `CREATE TABLE IF NOT EXISTS` for simplicity, production systems should use migration tools:

**Recommended tools:**
- [node-pg-migrate](https://github.com/salsita/node-pg-migrate)
- [Knex.js migrations](https://knexjs.org/guide/migrations.html)
- [Prisma Migrate](https://www.prisma.io/docs/concepts/components/prisma-migrate)

### Testing the API

**Using curl:**
```bash
# Register
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Login
TOKEN=$(curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}' \
  | jq -r '.token')

# Create ticket
curl -X POST http://localhost:8080/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Test ticket","description":"Testing API","category":"bug"}'

# List tickets
curl http://localhost:8080/tickets \
  -H "Authorization: Bearer $TOKEN"
```

---

## Frontend Architecture (Svelte)

### App.svelte Structure

The main component follows a single-file component pattern:

```
<script>      // JavaScript logic
  - State management (reactive variables)
  - API calls
  - Event handlers
</script>

<main>        // HTML markup
  {#if}       // Conditional rendering
  {#each}     // List rendering
</main>

<style>       // Scoped CSS
</style>
```

### State Management
- **Reactive variables:** `let token = ""`
- **localStorage:** Persist JWT token across sessions
- **onMount:** Load token and fetch data on component mount

### API Communication Pattern
```javascript
async function apiCall() {
  try {
    const response = await fetch(`${API_URL}/endpoint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      // Handle error
      errorMessage = result.error;
      return;
    }

    // Handle success
  } catch (err) {
    errorMessage = "Network error: " + err.message;
  }
}
```

### UI Patterns
- **Auth toggle:** Switch between login/register modes
- **Conditional rendering:** Show auth form OR logged-in content
- **Form validation:** Client-side checks before API calls
- **Error/success messages:** User feedback for actions
- **Auto-refresh:** Reload data after mutations

---

## Docker & Infrastructure

### Dockerfile Pattern (All Services)
```dockerfile
FROM node:20-alpine    # Minimal Node.js image
WORKDIR /app           # Set working directory
COPY package*.json ./  # Copy package files first (caching)
RUN npm install        # Install dependencies
COPY . .               # Copy application code
EXPOSE <port>          # Document port (informational)
CMD ["npm", "start"]   # Start command
```

### Docker Compose Configuration

**Key features:**
- **Version:** 3.9
- **Named volume:** `pgdata` for database persistence
- **Dependencies:** Explicit `depends_on` for startup order
- **Internal network:** Services communicate by container name
- **Port exposure:** Only gateway (8080) and Postgres (5432) exposed to host

**Service startup order:**
1. postgres
2. s1-auth-account (depends on postgres)
3. s2-ticket-intake (depends on postgres, s1-auth-account)
4. api-gateway (depends on s1, s2)

### Environment Variables in docker-compose.yml

All sensitive configuration is environment-based:
- **DB_URL:** Database connection string
- **JWT_SECRET:** Shared secret for token signing/verification
- **PORT:** Service port number

**Production considerations:**
- Use `.env` file or secret management (e.g., Docker secrets)
- Change `JWT_SECRET` from default
- Use strong database passwords
- Enable PostgreSQL SSL connections

---

## Troubleshooting

### Service won't start
**Symptom:** Container exits immediately

**Check:**
```bash
docker compose logs <service-name>
```

**Common causes:**
- Missing dependencies in package.json
- Syntax errors in JavaScript
- Database connection failures
- Port conflicts

### Database connection errors
**Symptom:** "Connection refused" or "ECONNREFUSED"

**Solutions:**
1. Ensure Postgres container is running:
   ```bash
   docker compose ps
   ```
2. Check database credentials in docker-compose.yml
3. Verify `DB_URL` format: `postgres://user:pass@host:port/database`
4. Wait for Postgres to fully initialize (may take a few seconds)

### JWT token errors
**Symptom:** "invalid token" or "missing token"

**Common causes:**
- `JWT_SECRET` mismatch between services (must be identical)
- Expired token (tokens expire in 1 hour)
- Malformed Authorization header (must be `Bearer <token>`)
- Token not stored properly in localStorage

**Fix:**
1. Verify `JWT_SECRET` is the same in S1 and S2 (docker-compose.yml)
2. Re-login to get a fresh token
3. Check browser console for errors

### CORS errors
**Symptom:** "blocked by CORS policy" in browser console

**Solutions:**
1. Ensure frontend runs on http://localhost:5173
2. Update CORS origin in `api-gateway/index.js`:
   ```javascript
   res.header("Access-Control-Allow-Origin", "http://localhost:5173");
   ```
3. Add credentials if needed:
   ```javascript
   res.header("Access-Control-Allow-Credentials", "true");
   ```

### Port conflicts
**Symptom:** "port is already allocated"

**Solutions:**
1. Stop conflicting services:
   ```bash
   docker compose down
   ```
2. Find process using port:
   ```bash
   lsof -i :8080
   ```
3. Change port in docker-compose.yml:
   ```yaml
   ports:
     - "8081:8080"  # Host:Container
   ```

### Database data persistence
**Clear database:**
```bash
docker compose down -v  # WARNING: Deletes all data
docker compose up --build
```

**Backup database:**
```bash
docker exec ticketing-postgres pg_dump -U ticketuser ticketdb > backup.sql
```

**Restore database:**
```bash
docker exec -i ticketing-postgres psql -U ticketuser ticketdb < backup.sql
```

---

## Best Practices for AI Assistants

### When Adding Features

1. **Read existing code first** - Never modify files without reading them
2. **Follow existing patterns** - Match coding style, error handling, and structure
3. **Update all layers** - Backend endpoint + frontend UI + this documentation
4. **Test thoroughly** - Verify endpoints with curl before UI integration
5. **Maintain consistency** - Use same JWT verification, error responses, DB patterns

### When Fixing Bugs

1. **Identify the service** - Determine which microservice has the issue
2. **Check logs** - Use `docker compose logs` to diagnose
3. **Understand data flow** - Gateway → Service → Database → Response
4. **Verify JWT handling** - Most auth issues stem from token problems
5. **Test edge cases** - Empty inputs, invalid IDs, unauthorized access

### When Refactoring

1. **Avoid breaking changes** - Maintain API compatibility
2. **Update documentation** - Keep this file in sync with code
3. **Consider service boundaries** - Don't tightly couple services
4. **Preserve database schema** - Schema changes require migrations
5. **Test all endpoints** - Ensure nothing breaks

### Security Considerations

1. **Never log sensitive data** - No passwords, tokens, or PII in console.log
2. **Validate all inputs** - Check types, ranges, and required fields
3. **Use parameterized queries** - Always use `$1, $2` placeholders (prevents SQL injection)
4. **Verify JWT on every protected endpoint** - Don't skip authentication
5. **Hash passwords** - Never store plain text (bcrypt already used)
6. **Implement rate limiting** - Consider adding to production deployments
7. **Use HTTPS in production** - Docker setup should include SSL/TLS

### Code Quality

1. **Error handling** - Always catch and handle errors gracefully
2. **Logging** - Use `console.error()` for errors, `console.log()` for info
3. **Comments** - Add comments for complex logic, not obvious code
4. **Consistent naming** - Follow existing camelCase/snake_case conventions
5. **DRY principle** - Extract repeated code into functions

---

## Production Deployment Checklist

Before deploying to production, address these items:

### Security
- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Use environment variables for all secrets (no hardcoded values)
- [ ] Enable HTTPS/TLS for all services
- [ ] Update CORS to allow only production domains
- [ ] Implement rate limiting on API Gateway
- [ ] Use strong PostgreSQL password
- [ ] Enable PostgreSQL SSL connections
- [ ] Add input sanitization for all user inputs
- [ ] Implement proper session management

### Database
- [ ] Replace `CREATE TABLE IF NOT EXISTS` with proper migrations
- [ ] Add foreign key constraints between tables
- [ ] Set up database backups
- [ ] Configure connection pooling limits
- [ ] Add database indexes for performance
- [ ] Enable query logging for monitoring

### Infrastructure
- [ ] Use production-grade container orchestration (Kubernetes, ECS, etc.)
- [ ] Set up health checks for all services
- [ ] Configure auto-restart policies
- [ ] Implement centralized logging (ELK, CloudWatch, etc.)
- [ ] Add monitoring and alerting (Prometheus, Grafana, etc.)
- [ ] Set resource limits (CPU, memory) for containers
- [ ] Configure load balancing for high availability

### Code Quality
- [ ] Add comprehensive test suite (unit, integration, e2e)
- [ ] Set up CI/CD pipeline
- [ ] Enable linting and code formatting
- [ ] Add API documentation (OpenAPI/Swagger)
- [ ] Implement graceful shutdown handling
- [ ] Add request validation middleware

### Frontend
- [ ] Build production bundle (`npm run build`)
- [ ] Enable production optimizations (minification, tree-shaking)
- [ ] Add error boundary components
- [ ] Implement proper loading states
- [ ] Add analytics and error tracking
- [ ] Configure CDN for static assets

---

## Additional Resources

### Related Documentation
- **README.md** - User-facing setup and usage guide
- **docker-compose.yml** - Infrastructure configuration
- **package.json files** - Dependency versions and scripts

### External References
- [Express.js Documentation](https://expressjs.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [JWT.io](https://jwt.io/) - JWT token debugger
- [Svelte Documentation](https://svelte.dev/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

### Microservices Patterns
- API Gateway Pattern
- Service Discovery (implicit via Docker DNS)
- Database per Service (logical separation, shared instance)
- JWT-based Authentication
- Synchronous HTTP communication

---

## Version History

**Last Updated:** 2025-11-29
**Codebase Version:** Based on commit 7608c44 "Working Tickers"
**Maintainer:** AI Assistant (Claude)

---

## Quick Reference Commands

```bash
# Start everything
cd infra && docker compose up --build

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Reset database
docker compose down -v

# Test API
curl http://localhost:8080/health

# Frontend dev
cd webclient && npm run dev

# Register user
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'

# Login and get token
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'
```

---

**This document is the source of truth for AI assistants working on this codebase. Keep it updated with any architectural changes, new patterns, or important decisions.**
