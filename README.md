# Ticketing Microservices System

A production-ready microservices-based ticketing system built with Node.js, Express, PostgreSQL, Docker, and Svelte. This project demonstrates modern microservices architecture with JWT authentication, API Gateway pattern, and containerized deployment.

## Features

- **Microservices Architecture** - Independent services with clear separation of concerns
- **API Gateway** - Single entry point for all client requests with CORS handling
- **JWT Authentication** - Secure token-based user authentication
- **PostgreSQL Database** - Reliable relational database for data persistence
- **Docker Compose** - Easy local development and deployment
- **Svelte Frontend** - Modern, reactive web UI for ticket management
- **RESTful APIs** - Clean, well-structured API endpoints

---

## Architecture Overview

```
Client (Browser) → http://localhost:5173 (Svelte UI)
                        ↓
                  API Gateway (:8080)
                        ↓
        ┌───────────────┼───────────────┐
        ↓               ↓               ↓
   S1: Auth       S2: Tickets      PostgreSQL
   (:3001)         (:3002)          (:5432)
```

### Services

- **API Gateway** (Port 8080) - Routes requests, handles CORS, provides unified entry point
- **S1: Auth Service** (Port 3001) - User registration, login, JWT token management
- **S2: Ticket Service** (Port 3002) - Ticket creation, listing, and retrieval
- **PostgreSQL** (Port 5432) - Database for users and tickets
- **Web Client** (Port 5173) - Svelte-based user interface

---

## Project Structure

```
ticketing-microservices/
├── api-gateway/              # API Gateway service
│   ├── index.js              # Express proxy with CORS
│   ├── package.json
│   └── Dockerfile
│
├── s1-auth-account/          # Authentication service
│   ├── index.js              # /register, /login, /me endpoints
│   ├── package.json
│   └── Dockerfile
│
├── s2-ticket-intake/         # Ticket management service
│   ├── index.js              # Ticket CRUD operations
│   ├── package.json
│   └── Dockerfile
│
├── webclient/                # Svelte frontend
│   ├── src/
│   │   ├── App.svelte        # Main UI component
│   │   ├── main.js
│   │   └── app.css
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── infra/
│   └── docker-compose.yml    # Container orchestration
│
├── CLAUDE.md                 # AI assistant guide
└── README.md                 # This file
```

---

## Prerequisites

- **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop)
- **Node.js 20+** (optional, for local development) - [Download here](https://nodejs.org/)

---

## Quick Start

### 1. Start the Backend Services

```bash
cd infra
docker compose up --build
```

This will start:
- PostgreSQL database
- Auth service (S1)
- Ticket service (S2)
- API Gateway

**Wait for all services to initialize** (look for "Server running on port..." messages)

### 2. Start the Frontend (Optional)

In a new terminal:

```bash
cd webclient
npm install
npm run dev
```

The web UI will be available at **http://localhost:5173**

### 3. Verify Everything Works

```bash
# Test the API Gateway health endpoint
curl http://localhost:8080/health

# Expected response: {"status":"ok"}
```

---

## Using the Application

### Via Web UI

1. Open **http://localhost:5173** in your browser
2. Click "Register" and create a new account
3. After registration, you'll be automatically logged in
4. Create tickets using the form
5. View your tickets in the list below

### Via API (curl examples)

#### 1. Register a New User

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword"
  }'
```

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "role": "user"
}
```

#### 2. Login

```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Save this token for authenticated requests!

#### 3. Create a Ticket

```bash
# Replace YOUR_TOKEN with the token from login
curl -X POST http://localhost:8080/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Application crashes on login",
    "description": "When I try to login, the app crashes immediately",
    "category": "bug"
  }'
```

**Response:**
```json
{
  "id": 1,
  "user_id": 1,
  "title": "Application crashes on login",
  "description": "When I try to login, the app crashes immediately",
  "category": "bug",
  "status": "new",
  "created_at": "2025-12-02T10:30:00.000Z"
}
```

#### 4. List Your Tickets

```bash
curl http://localhost:8080/tickets \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "tickets": [
    {
      "id": 1,
      "user_id": 1,
      "title": "Application crashes on login",
      "description": "When I try to login, the app crashes immediately",
      "category": "bug",
      "status": "new",
      "created_at": "2025-12-02T10:30:00.000Z"
    }
  ]
}
```

#### 5. Get Specific Ticket

```bash
curl http://localhost:8080/tickets/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 6. Get Current User Info

```bash
curl http://localhost:8080/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "user": {
    "sub": 1,
    "role": "user",
    "email": "user@example.com"
  }
}
```

---

## API Reference

### Authentication Endpoints

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/auth/register` | Create new user account | No |
| POST | `/auth/login` | Login and receive JWT token | No |
| GET | `/auth/me` | Get current user information | Yes |

### Ticket Endpoints

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/tickets` | Create a new ticket | Yes |
| GET | `/tickets` | List all user's tickets | Yes |
| GET | `/tickets/:id` | Get specific ticket details | Yes |

### Categories

Valid ticket categories:
- `bug` - Bug reports
- `feature` - Feature requests
- `support` - Support questions
- `other` - Other issues

---

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);
```

### Tickets Table

```sql
CREATE TABLE tickets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## Development

### Viewing Logs

```bash
# All services
cd infra
docker compose logs -f

# Specific service
docker compose logs -f s1-auth-account
docker compose logs -f s2-ticket-intake
docker compose logs -f api-gateway
```

### Stopping Services

```bash
cd infra

# Graceful stop
docker compose down

# Stop and remove database volumes (CLEARS ALL DATA)
docker compose down -v
```

### Rebuilding After Code Changes

```bash
cd infra
docker compose up --build
```

### Frontend Development

The webclient uses Vite with Hot Module Replacement (HMR):

```bash
cd webclient
npm run dev    # Development server with auto-reload
npm run build  # Production build (outputs to dist/)
npm run preview # Preview production build
```

---

## Configuration

### Environment Variables

Services use these environment variables (configured in `docker-compose.yml`):

**All Services:**
- `DB_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT token signing/verification (must match across services)
- `PORT` - Service port number

**Default Values (Development):**
- Database: `postgres://ticketuser:ticketpass@postgres:5432/ticketdb`
- JWT Secret: `dev-secret` ⚠️ **Change in production!**

### Ports

| Service | Internal Port | Exposed Port | URL |
|---------|---------------|--------------|-----|
| API Gateway | 8080 | 8080 | http://localhost:8080 |
| Auth (S1) | 3001 | - | Internal only |
| Tickets (S2) | 3002 | - | Internal only |
| PostgreSQL | 5432 | 5432 | localhost:5432 |
| Web Client | 5173 | 5173 | http://localhost:5173 |

---

## Troubleshooting

### Services won't start

**Check container status:**
```bash
cd infra
docker compose ps
```

**View error logs:**
```bash
docker compose logs <service-name>
```

**Common causes:**
- Port already in use (change port mapping in docker-compose.yml)
- Docker Desktop not running
- Syntax errors in code

### Database connection errors

**Symptoms:** "ECONNREFUSED" or "Connection refused"

**Solutions:**
1. Ensure Postgres container is running: `docker compose ps`
2. Wait a few seconds for Postgres to fully initialize
3. Restart services: `docker compose down && docker compose up`

### JWT token errors

**Symptoms:** "invalid token" or "missing token"

**Solutions:**
1. Verify `JWT_SECRET` is identical in S1 and S2 (check docker-compose.yml)
2. Token may have expired (tokens last 1 hour) - login again
3. Check Authorization header format: `Authorization: Bearer <token>`
4. Clear browser localStorage and re-login (for web UI)

### CORS errors in browser

**Symptoms:** "blocked by CORS policy" in browser console

**Solutions:**
1. Ensure frontend runs on http://localhost:5173
2. Check API Gateway CORS configuration in `api-gateway/index.js`
3. Restart API Gateway after changes

### Can't access web UI

**Solutions:**
1. Make sure you ran `npm install` in webclient directory
2. Check if port 5173 is available: `lsof -i :5173`
3. Verify Vite dev server is running: `cd webclient && npm run dev`

### Port conflicts

**Symptom:** "port is already allocated"

**Solutions:**
1. Stop other services using the same port
2. Change port mapping in docker-compose.yml:
   ```yaml
   ports:
     - "8081:8080"  # Use 8081 on host instead of 8080
   ```

### Reset everything

If nothing works, nuclear option:

```bash
cd infra

# Stop all containers and remove volumes
docker compose down -v

# Remove all images (optional)
docker compose down --rmi all

# Rebuild from scratch
docker compose up --build
```

---

## Testing

### Manual Testing Checklist

- [ ] Health check: `curl http://localhost:8080/health`
- [ ] Register new user via API
- [ ] Login and receive JWT token
- [ ] Create ticket with token
- [ ] List tickets
- [ ] Get specific ticket
- [ ] Access denied without token (should return 401)
- [ ] Web UI loads at http://localhost:5173
- [ ] Web UI registration works
- [ ] Web UI login works
- [ ] Web UI ticket creation works

### Sample Test Script

```bash
#!/bin/bash
# test-api.sh

API="http://localhost:8080"

# Register
echo "Registering user..."
curl -X POST $API/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'

echo -e "\n\nLogging in..."
# Login and extract token
TOKEN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: $TOKEN"

echo -e "\n\nCreating ticket..."
curl -X POST $API/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Test ticket","description":"Testing the API","category":"bug"}'

echo -e "\n\nListing tickets..."
curl $API/tickets \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n\nGetting user info..."
curl $API/auth/me \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n\nDone!"
```

Make it executable: `chmod +x test-api.sh`
Run it: `./test-api.sh`

---

## Production Deployment

⚠️ **This is a development setup.** Before deploying to production:

### Security
- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Use HTTPS/TLS for all services
- [ ] Update CORS to allow only your production domain
- [ ] Use strong database credentials
- [ ] Enable PostgreSQL SSL connections
- [ ] Add rate limiting to prevent abuse
- [ ] Implement input validation and sanitization

### Infrastructure
- [ ] Use proper container orchestration (Kubernetes, ECS, etc.)
- [ ] Set up database backups
- [ ] Configure health checks and auto-restart
- [ ] Add centralized logging (ELK, CloudWatch)
- [ ] Set up monitoring and alerting
- [ ] Use environment variables or secrets management

### Database
- [ ] Replace `CREATE TABLE IF NOT EXISTS` with proper migrations
- [ ] Add foreign key constraints
- [ ] Add database indexes for performance
- [ ] Configure connection pooling

### Code Quality
- [ ] Add comprehensive tests
- [ ] Set up CI/CD pipeline
- [ ] Add API documentation (Swagger/OpenAPI)
- [ ] Enable linting and code formatting

---

## Technology Stack

- **Backend:** Node.js 20, Express 5.x
- **Database:** PostgreSQL 16
- **Frontend:** Svelte 5.x, Vite 7.x
- **Auth:** JWT, bcryptjs
- **Containerization:** Docker, Docker Compose
- **Proxy:** http-proxy-middleware

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is provided as-is for educational and demonstration purposes.

---

## Support

- **Documentation:** See [CLAUDE.md](./CLAUDE.md) for detailed architecture guide
- **Issues:** Report bugs or request features via GitHub issues
- **Questions:** Check the troubleshooting section above

---

## Quick Reference

```bash
# Start everything
cd infra && docker compose up --build

# Stop everything
cd infra && docker compose down

# View logs
cd infra && docker compose logs -f

# Reset database
cd infra && docker compose down -v

# Start frontend
cd webclient && npm run dev

# Test API
curl http://localhost:8080/health
```

---

**Built with modern microservices architecture principles for scalability, maintainability, and cloud portability.**
